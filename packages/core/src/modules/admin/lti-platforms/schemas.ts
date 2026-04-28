import { z } from 'zod'

export const ltiPlatformSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  client_id: z.string(),
  deployment_id: z.string().optional(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  jwks_uri: z.string(),
  authorization_server: z.string(),
})

export type LtiPlatform = z.infer<typeof ltiPlatformSchema>

export const ltiPlatformListResponseSchema = z.object({
  platforms: z.array(ltiPlatformSchema),
})

export type LtiPlatformListResponse = z.infer<typeof ltiPlatformListResponseSchema>

export const ltiPlatformResponseSchema = z.object({
  platform: ltiPlatformSchema,
})

export type LtiPlatformResponse = z.infer<typeof ltiPlatformResponseSchema>

export const createLtiPlatformRequestSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  issuer: z.string().min(1, 'Issuer is required.'),
  client_id: z.string().min(1, 'Client ID is required.'),
  deployment_id: z.string().min(1).optional(),
})

export type CreateLtiPlatformRequest = z.infer<typeof createLtiPlatformRequestSchema>
