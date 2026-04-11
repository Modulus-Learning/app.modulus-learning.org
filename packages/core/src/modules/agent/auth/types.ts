import { z } from 'zod'

import type { JWTVerificationResult } from '@/lib/jwt/types.js'
import type { ActivityRecord, UserRecord } from './repository/index.js'

export type SignInResult = { user: UserRecord; activity: ActivityRecord }

export const accessTokenPayloadSchema = z.object({
  user: z.strictObject({
    id: z.string(),
    full_name: z.string().optional(),
  }),
  activity_id: z.string(),
  renew_after: z.number(),
})

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>
export type AccessTokenVerificationResult = JWTVerificationResult<AccessTokenPayload>

// export const tokenWithExpirationSchema = z.object({
//   token: z.string(),
//   expiration_in_ms: z.number(),
// })

// export type TokenWithExpiration = z.infer<typeof tokenWithExpirationSchema>
