type ApiRequestOptions = {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
}

type PageStateResponse = { page_state: any }

// A cumulative contribution target: `factor` is the share of the self
// activity's progress that flows to `url`.  The server derives the actual
// increment from the observed change in self's high-water mark (Δself × factor).
export type ProgressContribution = { url: string; factor: number }
export type ProgressResult = { url: string; progress: number }
type ProgressResponse = { progress: number; others?: ProgressResult[] }

// The single unified agent activity-state endpoint.
const AGENT_ACTIVITY_URL = '/routes/agent/activity'

export type ApiRequestResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'network-error'; error: string }
  | { status: 'client-error'; code: number; text: string }
  | { status: 'server-error'; code: number; text: string }
  | { status: 'session-expired'; baseUrl: string }

export class ApiClient {
  #baseUrl: string
  #token: string

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl
    this.#token = token
  }

  async #request<T>({ url, method, data }: ApiRequestOptions): Promise<ApiRequestResult<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#token}`,
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (data != null) {
      headers['Content-Type'] = 'application/json'
      fetchOptions.body = JSON.stringify(data)
    }

    try {
      const response = await fetch(`${this.#baseUrl}${url}`, fetchOptions)

      if (response.ok) {
        const { new_token, ...data } = await response.json()

        if (new_token) {
          this.#token = new_token
        }

        return { status: 'ok', data }
      }

      if (response.status === 401) {
        return { status: 'session-expired', baseUrl: this.#baseUrl }
      }

      const text = await response.text()

      // A non-401 4xx is terminal: the request is malformed, forbidden, or
      // targets something that doesn't exist, so retrying it won't help.  Only
      // 5xx (and other non-4xx failures) are transient enough to retry.
      if (response.status >= 400 && response.status < 500) {
        return { status: 'client-error', code: response.status, text }
      }

      return { status: 'server-error', code: response.status, text }
    } catch (err) {
      return { status: 'network-error', error: `${err}` }
    }
  }

  // All four operations are dispatched through the single unified endpoint,
  // discriminated by `op`.

  getProgress(urls?: string[]): Promise<ApiRequestResult<ProgressResponse>> {
    return this.#request({
      url: AGENT_ACTIVITY_URL,
      method: 'POST',
      data: { op: 'get-progress', urls },
    })
  }

  putProgress(
    progress: number,
    increments: ProgressContribution[]
  ): Promise<ApiRequestResult<ProgressResponse>> {
    return this.#request({
      url: AGENT_ACTIVITY_URL,
      method: 'POST',
      data: {
        op: 'set-progress',
        progress_for_current_page: progress,
        increments_for_other_pages: increments,
      },
    })
  }

  getPageState(): Promise<ApiRequestResult<PageStateResponse>> {
    return this.#request({
      url: AGENT_ACTIVITY_URL,
      method: 'POST',
      data: { op: 'get-page-state' },
    })
  }

  putPageState(page_state: any): Promise<ApiRequestResult<unknown>> {
    return this.#request({
      url: AGENT_ACTIVITY_URL,
      method: 'POST',
      data: { op: 'set-page-state', page_state },
    })
  }
}
