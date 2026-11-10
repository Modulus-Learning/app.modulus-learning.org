import type { Schema } from 'zod'

import { getServerConfig } from './config'

export type APIFetchOptions<T> = {
  // HTTP method.
  method: string

  // Data for request body.  If not undefined, will be JSON encoded and set as
  // request body, and the Content-Type header will be set.
  data?: any

  // Schema to use for validating response.
  responseSchema: Schema<T>
}

export interface APIClient {
  fetch<T>(path: string, options: APIFetchOptions<T>): Promise<T>
}

export const getApiClient = (token?: string): APIClient => {
  const { baseUrl } = getServerConfig().api

  return {
    async fetch(path, options) {
      const { method, data, responseSchema } = options

      const requestInit: RequestInit = {
        method,
      }

      if (data != null) {
        requestInit.body = JSON.stringify(data)
        requestInit.headers = { 'Content-Type': 'application/json', ...requestInit.headers }
      }

      if (token != null) {
        requestInit.headers = { Authorization: `Bearer ${token}` }
      }

      const response = await fetch(`${baseUrl}${path}`, requestInit)

      if (!response.ok) {
        throw new Error(`API fetch failed with status ${response.status}`)
      }

      const json = await response.json()
      return responseSchema.parse(json)
    },
  }
}
