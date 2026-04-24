export interface LtiPlatformsResponse {
  platforms: LtiPlatform[] | null
}

export interface LtiPlatform {
  id: string
  name: string
  issuer: string
  client_id: string
  deployment_id: string | null
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  authorization_server: string
}
