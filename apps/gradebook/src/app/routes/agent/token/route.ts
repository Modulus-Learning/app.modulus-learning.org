import { type NextRequest, NextResponse } from 'next/server'

import { getCoreInstance, getCoreRequestContext } from '@/core-adapter'

// OAuth 2.0 token exchange endpoint for agent auth
export const POST = async (request: NextRequest) => {
  const requestData = await request.formData()

  // TODO: validate with zod schema rather than just typecasting
  const grant_type = requestData.get('grant_type') as string
  const code = requestData.get('code') as string
  const client_id = requestData.get('client_id') as string
  const redirect_uri = requestData.get('redirect_uri') as string
  const code_verifier = requestData.get('code_verifier') as string

  if (
    grant_type !== 'authorization_code' ||
    client_id == null ||
    redirect_uri == null ||
    code == null ||
    code_verifier == null
  ) {
    return NextResponse.json(
      { error: 'error -- malformed token request' },
      {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    )
  }

  const core = await getCoreInstance()
  const ctx = await getCoreRequestContext()
  const result = await core.agent.auth.claimAuthCode(ctx, {
    code,
    client_id,
    redirect_uri,
    code_verifier,
  })

  if (result.ok) {
    return NextResponse.json(result.data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  return NextResponse.json(
    { error: 'error -- token exchange failed' },
    {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  )
}
