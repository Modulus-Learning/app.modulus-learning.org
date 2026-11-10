import { getCoreAgentRequestContext, getCoreCommands } from '@/lib/core/start-adapter'
import { getServerLogger } from '@/lib/server-logger'

const errorStatus = (code: string): number => {
  switch (code) {
    case 'ERR_UNAUTHORIZED':
      return 401
    case 'ERR_VALIDATION':
      return 400
    case 'ERR_FORBIDDEN':
      return 403
    case 'ERR_NOT_FOUND':
      return 404
    default:
      return 500
  }
}

export const AGENT_ACTIVITY_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * The agent's activity-state endpoint: one POST carrying an `op` and its
 * arguments, authorised by the agent bearer token.
 */
export const handleAgentActivity = async (request: Request): Promise<Response> => {
  const headers = AGENT_ACTIVITY_CORS
  const auth = await getCoreAgentRequestContext(request)
  if (!auth) {
    return Response.json({ status: 'unauthorized' }, { status: 401, headers })
  }

  const body = await request.json().catch(() => undefined)
  if (body == null || typeof body.op !== 'string') {
    return Response.json({ status: 'bad-request' }, { status: 400, headers })
  }

  const core = await getCoreCommands()
  const { op } = body
  const result = await (async () => {
    switch (op) {
      case 'get-progress':
        return core.agent.activityState.getProgress(auth, { urls: body.urls })
      case 'set-progress':
        return core.agent.activityState.setProgress(auth, {
          progress_for_current_page: body.progress_for_current_page,
          increments_for_other_pages: body.increments_for_other_pages,
        })
      case 'get-page-state':
        return core.agent.activityState.getPageState(auth)
      case 'set-page-state':
        return core.agent.activityState.setPageState(auth, { page_state: body.page_state })
      default:
        return undefined
    }
  })()

  if (result === undefined) {
    return Response.json({ status: 'bad-request', error: 'unknown op' }, { status: 400, headers })
  }

  if (!result.ok) {
    const { code, message } = result.error
    const status = errorStatus(code)
    getServerLogger()[status >= 500 ? 'error' : 'warn'](
      { requestId: auth.requestId, op, code, message },
      'agent activity-state command failed'
    )
    return Response.json({ status: 'error', code }, { status, headers })
  }

  return Response.json({ status: 'success', ...result.data }, { headers })
}
