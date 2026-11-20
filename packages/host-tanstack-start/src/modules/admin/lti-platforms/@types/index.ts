import { z } from 'zod'

export interface LtiPlatformsResponse {
  platforms: LtiPlatform[] | null
}

export interface LtiPlatform {
  id: string
  name: string
  issuer: string
  client_id: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  authorization_server: string
}

export interface LtiPlatformResponse {
  platform: LtiPlatform | null
}

export interface LtiPlatformFormState {
  errors: {
    name?: string[] | undefined
    issuer?: string[] | undefined
    client_id?: string[] | undefined
    authorization_endpoint?: string[] | undefined
    token_endpoint?: string[] | undefined
    jwks_uri?: string[] | undefined
    authorization_server?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

/** The four registration endpoints, in form order. */
export const ENDPOINT_FIELDS = [
  'authorization_endpoint',
  'token_endpoint',
  'jwks_uri',
  'authorization_server',
] as const

export type EndpointField = (typeof ENDPOINT_FIELDS)[number]

export type LtiPlatformEndpoints = Record<EndpointField, string>

/** Parses `value` as an absolute URL, or returns `undefined`. */
const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/** True when `url` carries a user name or password, as core rejects. */
const hasCredentials = (url: URL | undefined): boolean =>
  url != null && (url.username !== '' || url.password !== '')

/** True when `value` is already its own URL serialisation, as core requires of an issuer. */
const isStandardForm = (value: string, url: URL | undefined): boolean =>
  url == null || url.href === value || url.href === `${value}/`

const requiredString = (label: string) =>
  z.string({
    error: (issue) =>
      issue.input === undefined ? `${label} is required.` : `${label} must be a string.`,
  })

const nameSchema = requiredString('Name')
  .min(3, {
    error: 'Name must be 3 or more characters long.',
  })
  .max(100, {
    error: 'Name must not be greater than 100 characters.',
  })
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'Name cannot be empty.')

const clientIdSchema = requiredString('Client ID')
  .min(1, {
    error: 'Client ID is required.',
  })
  .max(255, {
    error: 'Client ID must not be greater than 255 characters.',
  })
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'Client ID cannot be empty.')

/**
 * Mirrors core's `issuerSchema` so the form can show the error beside the
 * field. Core validates again and remains the authority.
 */
const issuerSchema = requiredString('Issuer')
  .trim()
  .min(1, { error: 'Issuer is required.' })
  .max(255, { error: 'Issuer must not be greater than 255 characters.' })
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
    { error: 'Issuer must be an https URL without a query or fragment.', abort: true }
  )
  .refine((value) => !hasCredentials(parseUrl(value)), {
    error: 'Issuer must not contain a user name or password.',
    abort: true,
  })
  .refine((value) => isStandardForm(value, parseUrl(value)), {
    error:
      'Write the issuer in standard form, such as https://canvas.instructure.com: https:// and a lowercase host, with no default port.',
    abort: true,
  })
  .refine((value) => !value.endsWith('/'), {
    error: "Remove the trailing slash; the platform's iss claim has none.",
  })

/** An endpoint URL, as core's `endpointUrlSchema` accepts it. */
const endpointUrlSchema = (label: string) =>
  requiredString(label)
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(2048, { error: `${label} must not be greater than 2048 characters.` })
    .refine(
      (value) => {
        const url = parseUrl(value)
        return url != null && url.protocol === 'https:' && url.hash === '' && !value.includes('#')
      },
      { error: `${label} must be an https URL without a fragment.`, abort: true }
    )
    .refine((value) => value.startsWith('https://'), {
      error: `Write the ${label.toLowerCase()} in full, starting with https://.`,
      abort: true,
    })
    .refine((value) => !hasCredentials(parseUrl(value)), {
      error: `${label} must not contain a user name or password.`,
      abort: true,
    })

export const ltiPlatformEndpointsSchema = z.object({
  authorization_endpoint: endpointUrlSchema('Authorization endpoint'),
  token_endpoint: endpointUrlSchema('Token endpoint'),
  jwks_uri: endpointUrlSchema('JWKS URI'),
  // The client-credentials `aud`: core does not require a URL.
  authorization_server: requiredString('Authorization server')
    .trim()
    .min(1, { error: 'Authorization server is required.' })
    .max(2048, { error: 'Authorization server must not be greater than 2048 characters.' }),
})

export const ltiPlatformCreateSchema = z
  .object({
    name: nameSchema,
    issuer: issuerSchema,
    client_id: clientIdSchema,
  })
  .extend(ltiPlatformEndpointsSchema.shape)

/** An edit: a complete registration without the issuer, which never changes. */
export const ltiPlatformEditSchema = z
  .object({
    id: requiredString('ID').min(1, { error: 'ID is required.' }),
    name: nameSchema,
    client_id: clientIdSchema,
  })
  .extend(ltiPlatformEndpointsSchema.shape)
