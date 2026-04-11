import { z } from 'zod'

export const createAuthCodeSchemas = {
  input: z.object({
    client_id: z.string(),
    redirect_uri: z.string(),
    code_challenge: z.string(),
  }),

  output: z.object({
    code: z.string(),
  }),
}

export const claimAuthCodeSchemas = {
  input: z.object({
    code: z.string(),
    client_id: z.string(),
    redirect_uri: z.string(),
    code_verifier: z.string(),
  }),
  output: z.object({
    access_token: z.string(),
    api_base_url: z.string(),
    user: z.object({
      id: z.string(),
      full_name: z.string().optional(),
    }),
  }),
}

export type CreateAuthCodeRequest = z.infer<typeof createAuthCodeSchemas.input>
export type CreateAuthCodeResponse = z.infer<typeof createAuthCodeSchemas.output>
export type ClaimAuthCodeRequest = z.infer<typeof claimAuthCodeSchemas.input>
export type ClaimAuthCodeResponse = z.infer<typeof claimAuthCodeSchemas.output>
