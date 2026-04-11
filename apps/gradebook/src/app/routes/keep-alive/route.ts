import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// TODO: Should this route still exist?
export async function GET() {
  // TODO: Is this the right environment variable?
  await fetch(`https://${process.env.VERCEL_URL}/admin`)
  return NextResponse.json({ okay: true })
}
