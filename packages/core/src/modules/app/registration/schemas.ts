import { passwordSchema } from '@infonomic/schemas'
import { z } from 'zod'

export const preRegistrationRequestSchema = z.strictObject({
  full_name: z.string().min(4).max(50),
  email: z.email(),
  agreed_to_terms: z.boolean(),
  gtoken: z.string().optional(),
})

export type PreRegistrationRequest = z.infer<typeof preRegistrationRequestSchema>

export const preRegistrationResponseSchema = z.strictObject({
  id: z.uuid(),
})

export type PreRegistrationResponse = z.infer<typeof preRegistrationResponseSchema>

export const verifyEmailRequestSchema = z.strictObject({
  id: z.uuid(),
  verification_code: z.string(),
})

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>

export const verifyEmailResponseSchema = z.strictObject({
  id: z.uuid(),
})

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>

export const registrationRequestSchema = z.strictObject({
  id: z.uuid(),
  password: passwordSchema,
})

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>
