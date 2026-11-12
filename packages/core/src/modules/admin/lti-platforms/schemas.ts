import { z } from 'zod'

export const ltiPlatformSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  client_id: z.string(),
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

/** Parses `value` as an absolute URL, or returns `undefined`. */
const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/**
 * A platform issuer: an absolute `https:` URL with no query or fragment (IMS
 * Security Framework §1.2), and no trailing slash. Logins and launches match
 * the stored issuer exactly against the `iss` claim, which platforms send
 * without one, and the issuer can't be corrected after creation.
 */
export const issuerSchema = z
  .string()
  .trim()
  .min(1, 'Issuer is required.')
  .max(255, 'Issuer must be at most 255 characters.')
  .refine(
    (value) => {
      // `new URL` drops an empty `?` or `#`, so check the raw string too.
      const url = parseUrl(value)
      return (
        url != null &&
        url.protocol === 'https:' &&
        url.search === '' &&
        url.hash === '' &&
        !value.includes('?') &&
        !value.includes('#')
      )
    },
    { message: 'Issuer must be an https URL without a query or fragment.' }
  )
  .refine((value) => !value.endsWith('/'), {
    message: "Remove the trailing slash; the platform's iss claim has none.",
  })

/** A registration endpoint: an absolute `https:` URL; a query is allowed, a fragment is not. */
export const endpointUrlSchema = z
  .string()
  .trim()
  .min(1, 'Endpoint is required.')
  .max(2048, 'Endpoint must be at most 2048 characters.')
  .refine(
    (value) => {
      const url = parseUrl(value)
      return url != null && url.protocol === 'https:' && url.hash === '' && !value.includes('#')
    },
    { message: 'Endpoint must be an https URL without a fragment.' }
  )

/**
 * The client-credentials `aud`. The Security Framework leaves it to
 * out-of-band agreement, and Canvas's sample OpenID configuration gives a bare
 * host name, so it need not be a URL.
 */
export const audienceSchema = z
  .string()
  .trim()
  .min(1, 'Authorization server is required.')
  .max(2048, 'Authorization server must be at most 2048 characters.')

export const createLtiPlatformRequestSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  issuer: issuerSchema,
  client_id: z.string().min(1, 'Client ID is required.'),
  authorization_endpoint: endpointUrlSchema.optional(),
  token_endpoint: endpointUrlSchema.optional(),
  jwks_uri: endpointUrlSchema.optional(),
  authorization_server: audienceSchema.optional(),
})

export type CreateLtiPlatformRequest = z.infer<typeof createLtiPlatformRequestSchema>

/**
 * A complete statement of an existing registration. It has no `issuer`, which
 * is immutable; Zod's default stripping drops one sent by a client.
 */
export const updateLtiPlatformRequestSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required.'),
  client_id: z.string().min(1, 'Client ID is required.'),
  authorization_endpoint: endpointUrlSchema,
  token_endpoint: endpointUrlSchema,
  jwks_uri: endpointUrlSchema,
  authorization_server: audienceSchema,
})

export type UpdateLtiPlatformRequest = z.infer<typeof updateLtiPlatformRequestSchema>

export const suggestLtiPlatformEndpointsRequestSchema = z.object({
  issuer: issuerSchema,
})

export type SuggestLtiPlatformEndpointsRequest = z.infer<
  typeof suggestLtiPlatformEndpointsRequestSchema
>

export const suggestLtiPlatformEndpointsResponseSchema = z.object({
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  jwks_uri: z.string(),
  authorization_server: z.string(),
})

export type SuggestLtiPlatformEndpointsResponse = z.infer<
  typeof suggestLtiPlatformEndpointsResponseSchema
>

export const generateCanvasConfigRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tool_id: z.string().optional(),
  platform: z.string().optional(),
})

export type GenerateCanvasConfigRequest = z.infer<typeof generateCanvasConfigRequestSchema>

export const generateCanvasConfigResponseSchema = z.object({
  config_json: z.string(),
})

export type GenerateCanvasConfigResponse = z.infer<typeof generateCanvasConfigResponseSchema>
