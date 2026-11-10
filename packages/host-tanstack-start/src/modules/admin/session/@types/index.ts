import { checkBoxAsBooleanSchema } from '@infonomic/schemas'
import { z } from 'zod'

export type { AdminSession } from '@modulus-learning/core'

export interface SignInResponse {
  access_token: string
  refresh_token: string
  remember_me: boolean
}

export interface SignInFormState {
  errors: {
    email?: string[]
    password?: string[]
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const signInSchema = z.object({
  email: z
    .email({
      error: (issue) => (issue.input === undefined ? 'Email is required' : undefined),
    })
    .min(1, 'Email is required'),
  password: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Password is required' : undefined),
    })
    .min(1, 'Password is required')
    .min(8, 'Password must be 8 or more characters')
    .max(32, 'Password must be less than 32 characters')
    .regex(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/, 'Invalid password.'),
  remember_me: checkBoxAsBooleanSchema().optional().prefault(false),
})

export const accessTokenSchema = z.object({
  user: z.object({
    id: z.string(),
    given_name: z.string(),
    family_name: z.string(),
  }),
  abilities: z.string().array(),
  provider: z.literal('admin_session'),
  exp: z.number(),
})

export const refreshTokenSchema = z.object({
  id: z.string(),
  provider: z.literal('admin_session'),
  exp: z.number(),
})

export type AccessTokenPayload = z.infer<typeof accessTokenSchema>
// Alias Session for AdminSessionProvider - so that in effect,
// anywhere we refer to Session, we are referring to the AccessTokenPayload
// or 'claims' for this session in the context of JWTs.
export type Session = AccessTokenPayload
export type RefreshTokenPayload = z.infer<typeof refreshTokenSchema>
export type Provider = 'admin_session' | undefined
