import { NextResponse } from 'next/server'

import { getCoreInstance, getCoreRequestContext } from '@/core-adapter'

/**
 * Serves the current JSON Web Key Set used for communicating with LTI
 * platforms.
 *
 * According to https://www.imsglobal.org/spec/security/v1p0/#key-distribution
 * each keypair should be used for at most one platform+tool combination.  So we
 * can either put all keypairs in a single JWKS (the current set-up) or we
 * maintain separate JWKS endpoints, one for each platform we talk to.
 */
export async function GET() {
  const core = await getCoreInstance()
  const ctx = await getCoreRequestContext()
  const result = await core.app.lti.getJWKS(ctx)
  if (result.ok) {
    return NextResponse.json(result.data)
  }

  // TODO: Error handling?
  return NextResponse.json({ message: 'Internal error' }, { status: 500 })
}
