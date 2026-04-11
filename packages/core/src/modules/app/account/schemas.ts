import { z } from 'zod'

import type { AccountRecord, RoleRecord } from './repository/index.js'

export const accountSchema = z.object({
  id: z.string(),
  vid: z.number(),
  full_name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.email().nullable(),
  has_password: z.boolean(),
  github_id: z.number().nullable(), // TODO: Should be boolean like has_password
  google_id: z.string().nullable(), // TODO: Should be boolean like has_password
  lti_iss: z.string().nullable(), // TODO: Should be boolean like has_password
  lti_sub: z.string().nullable(), // OMIT
  last_provider: z.string().nullable(),
  last_login: z.iso.datetime().nullable(),
  is_enabled: z.boolean(),
  roles: z.uuid().array(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type Account = z.infer<typeof accountSchema>

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

export const accountResponseSchema = z.object({
  user: accountSchema,
  included: z.object({
    roles: roleSchema.array(),
  }),
})

export type AccountResponse = z.infer<typeof accountResponseSchema>

export const toAccountResponse = (
  user: AccountRecord,
  includedRoles: RoleRecord[]
): AccountResponse => {
  const {
    id,
    vid,
    full_name,
    username,
    email,
    has_password,
    github_id,
    google_id,
    lti_iss,
    lti_sub,
    last_provider,
    last_login,
    is_enabled,
    created_at,
    updated_at,
    roles,
  } = user

  return {
    user: {
      id,
      vid,
      full_name,
      username,
      email,
      has_password,
      github_id,
      google_id,
      lti_iss,
      lti_sub,
      last_provider,
      last_login: last_login?.toISOString() ?? null,
      is_enabled,
      roles,
      created_at: created_at?.toISOString(),
      updated_at: updated_at?.toISOString(),
    },
    included: {
      roles: includedRoles.map(
        ({ id, order, vid, name, description, machine_name, created_at, updated_at }) => ({
          id,
          order,
          vid,
          name,
          description,
          machine_name,
          created_at: created_at.toISOString(),
          updated_at: updated_at.toISOString(),
        })
      ),
    },
  }
}

// --------------------

export const setFullNameRequestSchema = z.strictObject({
  id: z.uuid(),
  vid: z.number(),
  full_name: z
    .string({ error: (issue) => (issue.input === undefined ? 'Name is required' : undefined) })
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must not be longer than 50 characters'), // TODO: why?
})

export type SetFullNameRequest = z.infer<typeof setFullNameRequestSchema>

export const setPasswordRequestSchema = z.strictObject({
  id: z.uuid(),
  vid: z.number(),
  password: z.string(), // should this include validation?
})

export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>

export const changePasswordRequestSchema = z.strictObject({
  id: z.uuid(),
  vid: z.number(),
  new_password: z.string(), // should this include validation?
  old_password: z.string(),
})

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>

export const changeEmailRequestSchema = z.strictObject({
  id: z.uuid(),
  vid: z.number(),
  email: z.email(),
})

export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>

export const verifyEmailRequestSchema = z.strictObject({
  id: z.uuid(),
  verification_code: z.string(),
})

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>
