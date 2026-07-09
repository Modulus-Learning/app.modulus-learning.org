import { type NextRequest, NextResponse } from 'next/server'

import { getCoreAgentRequestContext, getCoreCommands } from '@/core-adapter'
import { getLogger } from '@/lib/logger'

// Maps a core error code to the appropriate HTTP status.
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

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const OPTIONS = async (): Promise<NextResponse> => {
  return new NextResponse(null, {
    status: 200,
    headers,
  })
}

/**
 * Unified agent activity-state endpoint.  A single RPC-style route that
 * dispatches on the `op` discriminator in the request body to the relevant
 * activity-state command:
 *
 *   { op: 'get-progress',   urls?: string[] }
 *   { op: 'set-progress',   updates: [{ url?, progress }] }
 *   { op: 'get-page-state' }
 *   { op: 'set-page-state', page_state }
 *
 * Input is validated by each command's Zod schema; an unknown `op` is rejected
 * before reaching the core.
 */
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const auth = await getCoreAgentRequestContext(request)
  if (!auth) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401, headers })
  }

  const body = await request.json().catch(() => undefined)
  if (body == null || typeof body.op !== 'string') {
    return NextResponse.json({ status: 'bad-request' }, { status: 400, headers })
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
    return NextResponse.json(
      { status: 'bad-request', error: 'unknown op' },
      { status: 400, headers }
    )
  }

  if (!result.ok) {
    const { code, message } = result.error
    const status = errorStatus(code)
    getLogger()[status >= 500 ? 'error' : 'warn'](
      { requestId: auth.requestId, op, code, message },
      'agent activity-state command failed'
    )
    return NextResponse.json({ status: 'error', code }, { status, headers })
  }

  return NextResponse.json({ status: 'success', ...result.data }, { headers })
}
