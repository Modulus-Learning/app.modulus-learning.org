import { passwordSchema } from '@infonomic/schemas'
import { z } from 'zod'

//////////////////////////////////////////////////
// Requests
//////////////////////////////////////////////////

export const listUsersRequestSchema = z.object({
  page: z.number().int(),
  page_size: z.number().int(),
  order: z.enum(['created_at', 'id', 'full_name', 'username', 'email']),
  role: z.string(),
  query: z.string().optional(),
  desc: z.boolean(),
})

export type ListUsersRequest = z.infer<typeof listUsersRequestSchema>

export const getUserRequestSchema = z.object({
  id: z.uuid(),
})

export type GetUserRequest = z.infer<typeof getUserRequestSchema>

export const createUserRequestSchema = z.object({
  full_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Name is required.' : undefined),
    })
    .min(3, 'Fullname is required.')
    .max(50, 'Fullname must not be greater than 50 characters.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email is required.' : undefined),
  }),
  password: passwordSchema,
  roles: z.string().array().min(1),
  send_welcome: z.boolean(),
})

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>

export const updateUserRequestSchema = z.object({
  id: z.uuid(),
  vid: z.number(),
  full_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Name is required.' : undefined),
    })
    .min(3, 'Fullname is required.')
    .max(50, 'Fullname must not be greater than 50 characters.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email is required.' : undefined),
  }),
  password: passwordSchema.optional().or(z.literal('')), // TODO: Pick between optional or zero-length.
  is_enabled: z.boolean(),
  roles: z.string().array().min(1),
  previous_roles: z.array(z.string()).optional(),
})

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>

export const deleteUserRequestSchema = z.object({
  id: z.uuid(),
})

export type DeleteUserRequest = z.infer<typeof deleteUserRequestSchema>

//////////////////////////////////////////////////
// Responses
//////////////////////////////////////////////////

export const userSchema = z.object({
  id: z.string(),
  vid: z.number(),
  username: z.string().nullable(),
  email: z.email().nullable(),
  full_name: z.string(),
  is_enabled: z.boolean(),
  roles: z.string().array(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type User = z.infer<typeof userSchema>

export const roleSchema = z.object({
  id: z.string(),
  order: z.number(),
  vid: z.number(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  machine_name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type Role = z.infer<typeof roleSchema>

// TODO: rename field to admin_users?
export const userListResponseSchema = z.object({
  users: userSchema.array(),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
    total_pages: z.number(),
    role: z.string(),
    query: z.string().optional(),
    order: z.enum(['id', 'full_name', 'username', 'email', 'created_at']),
    desc: z.boolean(),
  }),
})

export type UserListResponse = z.infer<typeof userListResponseSchema>

// TODO: rename fields to admin_user and possibly included.admin_roles?
export const userResponseSchema = z.object({
  user: userSchema,
  included: z.object({
    roles: roleSchema.array(),
  }),
})

export type UserResponse = z.infer<typeof userResponseSchema>

export const createUserResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.email(),
    full_name: z.string(),
    roles: z.string().array(),
    created_at: z.iso.datetime(),
  }),
})

export type CreateUserResponse = z.infer<typeof createUserResponseSchema>

export const addUserResponseSchema = z.object({
  included: z.object({
    roles: roleSchema.array(),
  }),
})

export type AddUserResponse = z.infer<typeof addUserResponseSchema>
