import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const GET = async () => {
  return NextResponse.json({ status: 'okay' })
}
