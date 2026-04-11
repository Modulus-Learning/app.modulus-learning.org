import { z } from 'zod'

import type { JWTVerificationResult } from '@/lib/jwt/types.js'

export const signInResultSchema = z.strictObject({
  user: z.strictObject({
    id: z.string(),
    given_name: z.string().nullable(),
    family_name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  abilities: z.string().array(),
  provider: z.literal('admin_session'),
  remember_me: z.boolean(),
})

export type SignInResult = z.infer<typeof signInResultSchema>

export const accessTokenPayloadSchema = z.object({
  user: z.strictObject({
    id: z.string(),
    given_name: z.string().nullable(),
    family_name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  abilities: z.string().array(),
  provider: z.literal('admin_session'),
})

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>
export type AccessTokenVerificationResult = JWTVerificationResult<AccessTokenPayload>

export const refreshTokenPayloadSchema = z.object({
  admin_user_id: z.string(),
})

export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>
export type RefreshTokenVerificationResult = JWTVerificationResult<RefreshTokenPayload>

export const tokenWithExpirationSchema = z.object({
  token: z.string(),
  expiration_in_ms: z.number(),
})

export type TokenWithExpiration = z.infer<typeof tokenWithExpirationSchema>

export const adminTokensSchema = z.object({
  access: tokenWithExpirationSchema,
  refresh: tokenWithExpirationSchema,
  remember_me: z.boolean(),
})

export type AdminTokens = z.infer<typeof adminTokensSchema>

export const passwordCredentialsSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1, 'password cannot be empty'),
  remember_me: z.boolean().optional().default(false),
  ip_address: z.union([z.ipv4(), z.ipv6()]).optional(),
})

export type PasswordCredentials = z.infer<typeof passwordCredentialsSchema>

export const tokenRefreshRequestSchema = z.strictObject({
  adminRefreshToken: z.string(),
})

export type TokenRefreshRequest = z.infer<typeof tokenRefreshRequestSchema>

export const tokenRefreshResponseSchema = z.strictObject({
  tokens: adminTokensSchema,
  session: accessTokenPayloadSchema,
})

export type TokenRefreshResponse = z.infer<typeof tokenRefreshResponseSchema>
