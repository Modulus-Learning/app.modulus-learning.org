import { z } from 'zod'

import type { JWTVerificationResult } from '@/lib/jwt/types.js'

export const signInResultSchema = z.strictObject({
  user: z.strictObject({
    id: z.string(),
    full_name: z.string().optional(),
  }),
  abilities: z.string().array(),
  remember_me: z.boolean(),
})

export type SignInResult = z.infer<typeof signInResultSchema>

export const accessTokenPayloadSchema = z.object({
  user: z.strictObject({
    id: z.string(),
    full_name: z.string().optional(),
  }),
  abilities: z.string().array(),
})

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>
export type AccessTokenVerificationResult = JWTVerificationResult<AccessTokenPayload>

export const refreshTokenPayloadSchema = z.object({
  user_id: z.string(),
})

export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>
export type RefreshTokenVerificationResult = JWTVerificationResult<RefreshTokenPayload>

export const tokenWithExpirationSchema = z.object({
  token: z.string(),
  expiration_in_ms: z.number(),
})

export type TokenWithExpiration = z.infer<typeof tokenWithExpirationSchema>

export const userTokensSchema = z.object({
  access: tokenWithExpirationSchema,
  refresh: tokenWithExpirationSchema,
  remember_me: z.boolean(),
})

export type UserTokens = z.infer<typeof userTokensSchema>

export const passwordCredentialsSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1, 'password cannot be empty'),
  remember_me: z.boolean().optional().default(false),
  ip_address: z.union([z.ipv4(), z.ipv6()]).optional(),
})

export type PasswordCredentials = z.infer<typeof passwordCredentialsSchema>

// Not strict -- if Google sends us something unexpected, just assume it's
// unnecessary and strip it out.
export const googleOAuthCredentialsSchema = z.object({
  tokens: z.object({
    refresh_token: z.string().nullable().optional(),
    expiry_date: z.number().nullable().optional(),
    access_token: z.string().nullable().optional(),
    token_type: z.string().nullable().optional(),
    id_token: z.string().nullable().optional(),
    scope: z.string().optional(),
  }),
  remember_me: z.boolean(),
  user_id: z.uuid().optional(),
  ip_address: z.union([z.ipv4(), z.ipv6()]).optional(),
})

export type GoogleOAuthCredentials = z.infer<typeof googleOAuthCredentialsSchema>
export type GoogleTokens = GoogleOAuthCredentials['tokens']

// Not strict -- if Github sends us something unexpected, just assume it's
// unnecessary and strip it out.
export const githubOAuthCredentialsSchema = z.object({
  tokens: z.object({
    access_token: z.string(),
    scope: z.string(),
    token_type: z.string(),
  }),
  remember_me: z.boolean(),
  user_id: z.uuid().optional(),
  ip_address: z.union([z.ipv4(), z.ipv6()]).optional(),
})

export type GithubOAuthCredentials = z.infer<typeof githubOAuthCredentialsSchema>
export type GithubTokens = GithubOAuthCredentials['tokens']

export const tokenRefreshRequestSchema = z.strictObject({
  refreshToken: z.string(),
})

export type TokenRefreshRequest = z.infer<typeof tokenRefreshRequestSchema>

export const tokenRefreshResponseSchema = z.strictObject({
  tokens: userTokensSchema,
  session: accessTokenPayloadSchema,
})

export type TokenRefreshResponse = z.infer<typeof tokenRefreshResponseSchema>

// TODO: Does this need a schema?
export type LtiCredentials = {
  iss: string
  sub: string
  name?: string
  ip_address?: string
}
