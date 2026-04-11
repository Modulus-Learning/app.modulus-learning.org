import { passwordSchema } from '@infonomic/schemas'
import { z } from 'zod'

export const accountSchema = z.object({
  id: z.string(),
  vid: z.number(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  has_password: z.boolean(),
  email: z.email().nullable(),
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

export const setFullNameRequestSchema = z.object({
  id: z.uuid(),
  vid: z.number(),
  given_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Given name is required.' : undefined),
    })
    .min(2, 'Given name is required.')
    .max(100, 'Given name must not be greater than 100 characters.'),
  family_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Family name is required.' : undefined),
    })
    .min(2, 'Family name is required.')
    .max(100, 'Family name must not be greater than 100 characters.'),
})

export type SetFullNameRequest = z.infer<typeof setFullNameRequestSchema>

export const changePasswordRequestSchema = z.object({
  id: z.uuid(),
  vid: z.number(),
  old_password: z.string(),
  new_password: passwordSchema,
})

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>

export const changeEmailRequestSchema = z.object({
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
