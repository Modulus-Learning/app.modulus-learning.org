import type { LtiPlatformRecord } from './repository.js'
import type { LtiPlatform } from './schemas.js'

export const toPlatform = ({
  id,
  name,
  issuer,
  client_id,
  authorization_endpoint,
  token_endpoint,
  jwks_uri,
  authorization_server,
}: LtiPlatformRecord): LtiPlatform => ({
  id,
  name,
  issuer,
  client_id,
  authorization_endpoint,
  token_endpoint,
  jwks_uri,
  authorization_server,
})
