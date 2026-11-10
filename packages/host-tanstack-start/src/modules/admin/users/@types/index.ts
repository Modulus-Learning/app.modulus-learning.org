import {
  booleanSchema,
  integerFromStringSchema,
  passwordSchema,
  uuidSchema,
} from '@infonomic/schemas'
import { z } from 'zod'

export interface User {
  id: string
  vid: number
  full_name: string
  email: string | null
  created_at: string
  updated_at: string
  is_enabled: boolean
  roles: string[]
  // role_user: {
  //   role_id: string
  //   user_id: string
  //   role: {
  //     id: string
  //     name: string
  //     machine_name: string
  //   }
  // }[]
}

// export type UserInList = Omit<User, 'role_user'> & {
//   roles: string[]
// }

export interface UsersResponse {
  users: User[] | null
  meta: {
    page: number
    page_size: number
    total: number
    total_pages: number
    role: string
    query?: string | undefined
    order: string
    desc: boolean
  }
}

export interface Role {
  id: string
  vid: number
  machine_name: string
  name: string | null
  description: string | null
  created_at: string
  updated_at: string
}

/**
 * A user's stored LTI identity. `linked` is true only when both values are
 * set; a half-set pair is incomplete data, which sign-in treats as unlinked.
 */
export interface LtiIdentity {
  issuer: string | null
  subject: string | null
  linked: boolean
}

export interface UserResponse {
  user: User | null
  included: {
    roles: Role[]
    // Null when the account has no LTI identity data; absent on a failed load.
    lti?: LtiIdentity | null
  }
}

export interface UnlinkLtiState {
  status: 'idle' | 'success' | 'conflict' | 'failed'
  message?: string
}

/**
 * The identity the admin was shown, as the form carries it: one JSON field,
 * so null and the empty string stay distinct. Neither is ruled out for a
 * stored value, and the conditional unlink must match exactly what is stored.
 */
export const expectedLtiIdentitySchema = z.strictObject({
  issuer: z.string().max(2048).nullable(),
  subject: z.string().max(255).nullable(),
})

export type ExpectedLtiIdentity = z.infer<typeof expectedLtiIdentitySchema>

export const encodeExpectedLtiIdentity = (identity: ExpectedLtiIdentity): string =>
  JSON.stringify({ issuer: identity.issuer, subject: identity.subject })

const expectedLtiIdentityField = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'expected identity is not valid JSON' })
      return z.NEVER
    }
  })
  .pipe(expectedLtiIdentitySchema)

export const unlinkLtiFormSchema = z.object({
  id: uuidSchema,
  vid: integerFromStringSchema,
  expected: expectedLtiIdentityField,
})

export interface UserAddResponse {
  included: {
    roles: Role[]
  }
}

export interface UserFormState {
  errors: {
    full_name?: string[] | undefined
    email?: string[] | undefined
    password?: string[] | undefined
    roles?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface UserDeleteState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const validateSearchParamsSchema = z.strictObject({
  page: integerFromStringSchema.prefault(1),
  page_size: integerFromStringSchema.prefault(10),
  order: z.enum(['created_at', 'id', 'full_name', 'username', 'email']).prefault('created_at'),
  role: z.string().max(50, 'role must be a string with a maximum of 50 characters').prefault('all'),
  query: z.string().max(128, 'query must be a string with a maximum of 128 characters').optional(),
  desc: booleanSchema(true),
}) // Ensures no extra properties are allowed

export const userCreateSchema = z.object({
  full_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Fullname is required.' : 'Fullname must be a string.',
    })
    .min(3, {
      error: 'Fullname must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Fullname must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Fullname cannot be empty.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email address is required.' : undefined),
  }),
  password: passwordSchema,
  roles: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Roles is required.' : 'Roles must be a string.',
    })
    .min(36, {
      error: 'Please select at least one role.',
    }), // 36 is the length of a UUIDv7 ID
  send_welcome: booleanSchema(false),
})

export const userEditSchema = z.object({
  id: uuidSchema,
  vid: integerFromStringSchema,
  full_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Fullname is required.' : 'Fullname must be a string.',
    })
    .min(3, {
      error: 'Fullname must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Fullname must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Fullname cannot be empty.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email address is required.' : undefined),
  }),
  password: passwordSchema.optional().or(z.literal('')), // Allows empty string or undefined,
  is_enabled: booleanSchema(true),
  roles: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.uuid().array().min(1)),
  previous_roles: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.uuid().array()),
})

export const userDeleteSchema = z.object({
  userId: uuidSchema,
  full_name: z.string(),
})
