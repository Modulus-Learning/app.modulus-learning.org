import {
  booleanSchema,
  integerFromStringSchema,
  passwordSchema,
  uuidSchema,
} from '@infonomic/schemas'
import { z } from 'zod'

export interface AdminUser {
  id: string
  vid: number
  given_name: string
  family_name: string
  email: string
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

export interface AdminUsersResponse {
  users: AdminUser[] | null
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

export interface AdminRole {
  id: string
  vid: number
  machine_name: string
  name: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface AdminUserResponse {
  user: AdminUser | null
  included: {
    roles: AdminRole[]
  }
}

export interface AdminUserAddResponse {
  included: {
    roles: AdminRole[]
  }
}

export interface AdminUserFormState {
  errors: {
    given_name?: string[] | undefined
    family_name?: string[] | undefined
    email?: string[] | undefined
    password?: string[] | undefined
    is_enabled?: string[] | undefined
    roles?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface AdminUserDeleteState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const validateSearchParamsSchema = z.strictObject({
  page: integerFromStringSchema.optional().prefault(1),
  page_size: integerFromStringSchema.optional().prefault(10),
  order: z
    .enum(['created_at', 'id', 'given_name', 'family_name', 'username', 'email'])
    .prefault('created_at'),
  role: z
    .string()
    .max(50, 'role must be a string with a maximum of 50 characters')
    .optional()
    .prefault('all'),
  query: z.string().max(128, 'query must be a string with a maximum of 128 characters').optional(),
  desc: booleanSchema(true),
}) // Ensures no extra properties are allowed

export const adminUserCreateSchema = z.object({
  given_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Given name is required.' : 'Given name must be a string.',
    })
    .min(3, {
      error: 'Given name must be 3 or more characters long.',
    })
    .max(100, {
      error: 'Given name must not be greater than 100 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Given name cannot be empty.'),
  family_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Family name is required.' : 'Family name must be a string.',
    })
    .min(3, {
      error: 'Family name must be 3 or more characters long.',
    })
    .max(100, {
      error: 'Family name must not be greater than 100 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Family name cannot be empty.'),
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

export const adminUserEditSchema = z.object({
  id: uuidSchema,
  vid: integerFromStringSchema,
  given_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Given name is required.' : 'Given name must be a string.',
    })
    .min(3, {
      error: 'Given name must be 3 or more characters long.',
    })
    .max(100, {
      error: 'Given name must not be greater than 100 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Given name cannot be empty.'),
  family_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Family name is required.' : 'Family name must be a string.',
    })
    .min(3, {
      error: 'Family name must be 3 or more characters long.',
    })
    .max(100, {
      error: 'Family name must not be greater than 100 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Family name cannot be empty.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email address is required.' : undefined),
  }),
  password: passwordSchema.optional().or(z.literal('')), // Allows empty string or undefined,
  is_enabled: booleanSchema(true),
  roles: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Roles is required.' : 'Roles must be a string.',
    })
    .min(36, {
      error: 'Please select at least one role.',
    }), // 36 is the length of a UUIDv7 ID
  // roles: z.string().optional().or(z.literal('')), // 36 is the length of at least one UUIDv7 ID
  previous_roles: z.string(), // .optional().or(z.literal('')),
})

export const adminUserDeleteSchema = z.object({
  userId: uuidSchema,
  given_name: z.string(),
  family_name: z.string(),
})
