export type JWTVerifierConfig = {
  publicKey: string
  issuer: string
  audience: string
}

export type JWTSignerConfig = {
  privateKey: string
  issuer: string
  audience: string
  expires: { access: number; refresh: number }
}

export type JWTWithExpiration = {
  token: string
  expiration_in_ms: number
}

export type JWTVerificationResult<TPayload> =
  | {
      status: 'valid'
      expires_at_ms: number
      payload: TPayload
      error?: undefined
    }
  | {
      status: 'invalid'
      expires_at_ms?: undefined
      payload?: undefined
      error: unknown
    }
  | {
      status: 'missing' | 'expired' | 'bad_payload'
      expires_at_ms?: undefined
      payload?: undefined
      error?: undefined
    }
