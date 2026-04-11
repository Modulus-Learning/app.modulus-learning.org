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

export interface UserResponse {
  user: User | null
  included: {
    roles: Role[]
  }
}

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
  page: integerFromStringSchema.optional().prefault(1),
  page_size: integerFromStringSchema.optional().prefault(10),
  order: z.enum(['created_at', 'id', 'full_name', 'username', 'email']).prefault('created_at'),
  role: z
    .string()
    .max(50, 'role must be a string with a maximum of 50 characters')
    .optional()
    .prefault('all'),
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
