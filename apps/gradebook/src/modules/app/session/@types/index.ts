import { checkBoxAsBooleanSchema } from '@infonomic/schemas'
import type { UserTokens } from '@modulus-learning/core'
import { z } from 'zod'

export type { UserSession } from '@modulus-learning/core'

export const accessTokenSchema = z.object({
  user: z.object({
    id: z.string(),
    full_name: z.string(),
  }),
  abilities: z.string().array(),
  provider: z.literal('user_session'),
  exp: z.number(),
})

export const refreshTokenSchema = z.object({
  id: z.string(),
  provider: z.literal('user_session'),
  exp: z.number(),
})

export type AccessTokenPayload = z.infer<typeof accessTokenSchema>
// Alias Session for UserSessionProvider - so that in effect,
// anywhere we refer to Session, we are referring to the AccessTokenPayload
// or 'claims' for this session in the context of JWTs.
export type Session = AccessTokenPayload
export type RefreshTokenPayload = z.infer<typeof refreshTokenSchema>
export type Provider = 'user_session' | undefined

export interface SignInResponse {
  access_token: string
  refresh_token: string
  remember_me: boolean
}

export interface SignInFormState {
  errors: {
    email?: string[]
    password?: string[]
    remember_me?: string[]
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
  callback_url: z.string().optional(),
})

export interface GitHubFormState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface GoogleFormState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface GoogleOAuthState {
  source: string
  callbackUrl: string
  csrfToken: string
}

export interface GoogleOAuthCredentials {
  /**
   * This field is only present if the access_type parameter was set to offline in the authentication request. For details, see Refresh tokens.
   */
  refresh_token?: string | null
  /**
   * The time in ms at which this token is thought to expire.
   */
  expiry_date?: number | null
  /**
   * A token that can be sent to a Google API.
   */
  access_token?: string | null
  /**
   * Identifies the type of token returned. At this time, this field always has the value Bearer.
   */
  token_type?: string | null
  /**
   * A JWT that contains identity information about the user that is digitally signed by Google.
   */
  id_token?: string | null
  /**
   * The scopes of access granted by the access_token expressed as a list of space-delimited, case-sensitive strings.
   */
  scope?: string
}

export interface OAuthSessionResponse {
  error_code: string
  message: string
  status: string
  tokens?: UserTokens
}
