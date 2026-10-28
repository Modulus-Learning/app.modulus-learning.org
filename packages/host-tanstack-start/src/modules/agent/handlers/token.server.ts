import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/** The agent's OAuth 2.0 token endpoint: exchanges an authorization code (with PKCE) for tokens. */
export const handleAgentToken = async (request: Request): Promise<Response> => {
  const requestData = await request.formData()
  const grant_type = requestData.get('grant_type') as string | null
  const code = requestData.get('code') as string | null
  const client_id = requestData.get('client_id') as string | null
  const redirect_uri = requestData.get('redirect_uri') as string | null
  const code_verifier = requestData.get('code_verifier') as string | null

  if (
    grant_type !== 'authorization_code' ||
    client_id == null ||
    redirect_uri == null ||
    code == null ||
    code_verifier == null
  ) {
    return Response.json(
      { error: 'error -- malformed token request' },
      { status: 400, headers: CORS }
    )
  }

  const core = await getCoreCommands()
  const result = await core.agent.auth.claimAuthCode(getCoreRequestContext(), {
    code,
    client_id,
    redirect_uri,
    code_verifier,
  })

  if (result.ok) {
    return Response.json(result.data, { headers: CORS })
  }
  return Response.json({ error: 'error -- token exchange failed' }, { status: 400, headers: CORS })
}
