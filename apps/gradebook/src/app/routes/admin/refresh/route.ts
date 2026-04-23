import { type NextRequest, NextResponse } from 'next/server'

import { getCoreCommands, getCoreRequestContext } from '@/core-adapter'

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  let refreshToken: any
  try {
    const body = await request.json()
    refreshToken = body.refreshToken
  } catch (_) {
    return NextResponse.json({ status: 'failed', message: 'invalid request' }, { status: 400 })
  }

  if (typeof refreshToken !== 'string') {
    return NextResponse.json({ status: 'failed', message: 'invalid request' }, { status: 400 })
  }

  const core = await getCoreCommands()
  const ctx = await getCoreRequestContext()
  const result = await core.admin.session.refreshTokens(ctx, { adminRefreshToken: refreshToken })

  if (!result.ok) {
    return NextResponse.json({ status: 'failed', message: 'revalidation failed' }, { status: 403 })
  }

  return NextResponse.json({ status: 'success', result: result.data })
}
