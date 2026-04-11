import { passwordSchema } from '@infonomic/schemas'
import { z } from 'zod'

//////////////////////////////////////////////////
// Requests
//////////////////////////////////////////////////

export const listAdminUsersRequestSchema = z.object({
  page: z.number().int(),
  page_size: z.number().int(),
  order: z.enum(['created_at', 'id', 'given_name', 'family_name', 'username', 'email']),
  role: z.string(),
  query: z.string().optional(),
  desc: z.boolean(),
})

export type ListAdminUsersRequest = z.infer<typeof listAdminUsersRequestSchema>

export const getAdminUserRequestSchema = z.object({
  id: z.uuid(),
})

export type GetAdminUserRequest = z.infer<typeof getAdminUserRequestSchema>

export const createAdminUserRequestSchema = z.object({
  given_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Given name is required.' : undefined),
    })
    .min(3, 'Given name is required.')
    .max(100, 'Given name must not be greater than 100 characters.'),
  family_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Family name is required.' : undefined),
    })
    .min(3, 'Family name is required.')
    .max(100, 'Family name must not be greater than 100 characters.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email is required.' : undefined),
  }),
  password: passwordSchema,
  roles: z.string().array().min(1),
  send_welcome: z.boolean(),
})

export type CreateAdminUserRequest = z.infer<typeof createAdminUserRequestSchema>

export const updateAdminUserRequestSchema = z.object({
  id: z.uuid(),
  vid: z.number(),
  given_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Given name is required.' : undefined),
    })
    .min(3, 'Given name is required.')
    .max(100, 'Given name must not be greater than 100 characters.'),
  family_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Family name is required.' : undefined),
    })
    .min(3, 'Family name is required.')
    .max(100, 'Family name must not be greater than 100 characters.'),
  email: z.email({
    error: (issue) => (issue.input === undefined ? 'Email is required.' : undefined),
  }),
  password: passwordSchema.optional().or(z.literal('')), // TODO: Pick between optional or zero-length.
  is_enabled: z.boolean(),
  roles: z.string().array().min(1),
  previous_roles: z.array(z.string()).optional(),
})

export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>

export const deleteAdminUserRequestSchema = z.object({
  id: z.uuid(),
})

export type DeleteAdminUserRequest = z.infer<typeof deleteAdminUserRequestSchema>

//////////////////////////////////////////////////
// Responses
//////////////////////////////////////////////////

export const adminUserSchema = z.object({
  id: z.string(),
  vid: z.number(),
  username: z.string().nullable(),
  email: z.email(),
  given_name: z.string(),
  family_name: z.string(),
  is_enabled: z.boolean(),
  roles: z.string().array(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type AdminUser = z.infer<typeof adminUserSchema>

export const adminRoleSchema = z.object({
  id: z.string(),
  order: z.number(),
  vid: z.number(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  machine_name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type AdminRole = z.infer<typeof adminRoleSchema>

// TODO: rename field to admin_users?
export const adminUserListResponseSchema = z.object({
  users: adminUserSchema.array(),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
    total_pages: z.number(),
    role: z.string(),
    query: z.string().optional(),
    order: z.enum(['id', 'given_name', 'family_name', 'username', 'email', 'created_at']),
    desc: z.boolean(),
  }),
})

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>

// TODO: rename fields to admin_user and possibly included.admin_roles?
export const adminUserResponseSchema = z.object({
  user: adminUserSchema,
  included: z.object({
    roles: adminRoleSchema.array(),
  }),
})

export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>

export const createAdminUserResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.email(),
    given_name: z.string(),
    family_name: z.string(),
    roles: z.string().array(),
    created_at: z.iso.datetime(),
  }),
})

export type CreateAdminUserResponse = z.infer<typeof createAdminUserResponseSchema>

export const addAdminUserResponseSchema = z.object({
  included: z.object({
    roles: adminRoleSchema.array(),
  }),
})

export type AddAdminUserResponse = z.infer<typeof addAdminUserResponseSchema>
