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

/**
 * Clears a learner's LTI identity. `vid`, `lti_iss` and `lti_sub` are the
 * values the administrator was shown; the write applies only while they still
 * match, so a stale page cannot clear a link made after it was loaded.
 */
export const unlinkUserLtiIdentityRequestSchema = z.strictObject({
  id: z.uuid(),
  vid: z.number().int(),
  lti_iss: z.string().max(2048).nullable(),
  lti_sub: z.string().max(255).nullable(),
})

export type UnlinkUserLtiIdentityRequest = z.infer<typeof unlinkUserLtiIdentityRequestSchema>

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
/**
 * A user's LTI identity as stored. `linked` is true only when both columns are
 * set: the sign-in code treats an account with either column null as unlinked,
 * so a half-set pair is shown as incomplete data rather than a link.
 */
export const ltiIdentitySchema = z.object({
  issuer: z.string().nullable(),
  subject: z.string().nullable(),
  linked: z.boolean(),
})

export type LtiIdentity = z.infer<typeof ltiIdentitySchema>

export const userResponseSchema = z.object({
  user: userSchema,
  included: z.object({
    roles: roleSchema.array(),
    // Null when the account has no LTI identity data at all.
    lti: ltiIdentitySchema.nullable(),
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

export const unlinkUserLtiIdentityResponseSchema = z.object({
  // False when the account was already unlinked and nothing was written.
  changed: z.boolean(),
  vid: z.number().int(),
})

export type UnlinkUserLtiIdentityResponse = z.infer<typeof unlinkUserLtiIdentityResponseSchema>
