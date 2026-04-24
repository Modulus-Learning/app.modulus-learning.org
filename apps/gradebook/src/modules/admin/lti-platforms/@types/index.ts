import { z } from 'zod'

export interface LtiPlatformsResponse {
  platforms: LtiPlatform[] | null
}

export interface LtiPlatform {
  id: string
  name: string
  issuer: string
  client_id: string
  deployment_id: string | null
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  authorization_server: string
}

export interface LtiPlatformFormState {
  errors: {
    name?: string[] | undefined
    issuer?: string[] | undefined
    client_id?: string[] | undefined
    deployment_id?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const ltiPlatformCreateSchema = z.object({
  name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Name is required.' : 'Name must be a string.',
    })
    .min(3, {
      error: 'Name must be 3 or more characters long.',
    })
    .max(100, {
      error: 'Name must not be greater than 100 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Name cannot be empty.'),
  issuer: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Issuer is required.' : 'Issuer must be a string.',
    })
    .min(3, {
      error: 'Issuer must be 3 or more characters long.',
    })
    .max(255, {
      error: 'Issuer must not be greater than 255 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Issuer cannot be empty.'),
  client_id: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Client ID is required.' : 'Client ID must be a string.',
    })
    .min(1, {
      error: 'Client ID is required.',
    })
    .max(255, {
      error: 'Client ID must not be greater than 255 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Client ID cannot be empty.'),
  deployment_id: z
    .string()
    .max(255, {
      error: 'Deployment ID must not be greater than 255 characters.',
    })
    .optional(),
})
