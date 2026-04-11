import { type NextRequest, NextResponse } from 'next/server'

import { getCoreAgentRequestContext, getCoreInstance } from '@/core-adapter'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const OPTIONS = async (): Promise<NextResponse> => {
  return new NextResponse(null, {
    status: 200,
    headers,
  })
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const auth = await getCoreAgentRequestContext(request)
  if (!auth) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401, headers })
  }

  const core = await getCoreInstance()
  const result = await core.agent.activityState.getPageState(auth)

  if (!result.ok) {
    // TODO: Decide on a response shape for reporting errors in this and related
    // routes.
    return NextResponse.json({ status: 'failed' }, { status: 500, headers })
  }

  return NextResponse.json({ status: 'success', ...result.data }, { headers })
}

export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  const auth = await getCoreAgentRequestContext(request)
  if (!auth) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401, headers })
  }

  const requestBody = await request.json()

  const core = await getCoreInstance()
  const result = await core.agent.activityState.setPageState(auth, requestBody)

  if (!result.ok) {
    return NextResponse.json({ status: 'failed' }, { status: 500, headers })
  }

  return NextResponse.json({ status: 'success', ...result.data }, { headers })
}
