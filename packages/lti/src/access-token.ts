export type AccessToken = {
  token: string
  expires: Date
  scopes: string[]
}

export type AccessTokenResult =
  | {
      ok: true
      accessToken: AccessToken
    }
  | {
      ok: false
      category: 'transient' | 'platform_config' | 'rate_limit' | 'unknown'
      message: string
      status_code?: number
    }
