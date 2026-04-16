import { type NextRequest, NextResponse } from 'next/server'

import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'

export async function GET(request: NextRequest) {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return NextResponse.json({ status: 'failed', message: 'Not authenticated' }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ status: 'failed', message: 'Missing id' }, { status: 400 })
  }

  const core = await getCoreInstance()
  const result = await core.app.activities.getActivitiesByActivityCodeId(userAuth, id)

  if (!result.ok) {
    return NextResponse.json(
      { status: 'failed', message: 'Error fetching activities' },
      { status: 500 }
    )
  }

  return NextResponse.json({ status: 'success', activities: result.data.activities })
}
