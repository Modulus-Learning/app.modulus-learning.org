import { getServerConfig } from '@/config'

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** Server half of `registerPlatformFn`. */
export const registerPlatform = async (data: {
  openid_configuration?: string
  registration_token?: string
}): Promise<{ success: boolean; data: Json }> => {
  // TODO (carried over): validate openid_configuration and registration_token,
  // and add auth headers, before forwarding.
  // A failure is reported on the page rather than as a 500: the Next page
  // streamed under Suspense, so the platform admin saw "Registration failed"
  // inside a 200 response, and still needs the Close button to end the flow.
  try {
    const response = await fetch(`${getServerConfig().api.baseUrl}/lti/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return { success: response.ok, data: (await response.json()) as Json }
  } catch (error) {
    return { success: false, data: { error: (error as Error).message } }
  }
}
