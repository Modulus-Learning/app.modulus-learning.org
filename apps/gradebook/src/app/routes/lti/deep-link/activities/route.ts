import { type NextRequest, NextResponse } from 'next/server'

import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'

export async function GET(request: NextRequest) {
  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return NextResponse.json({ status: 'failed', message: 'Not authenticated' }, { status: 401 })
  }

  const private_code = request.nextUrl.searchParams.get('private_code')
  if (!private_code || typeof private_code !== 'string') {
    return NextResponse.json({ status: 'failed', message: 'Missing private_code' }, { status: 400 })
  }

  const core = await getCoreInstance()
  const result = await core.app.activities.getActivitiesByPrivateCode(userAuth, private_code)

  if (!result.ok) {
    return NextResponse.json(
      { status: 'failed', message: 'Error fetching activities' },
      { status: 500 }
    )
  }

  return NextResponse.json({ status: 'success', activities: result.data.activities })
}
