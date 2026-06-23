type ApiRequestOptions = {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
}

type PageStateResponse = { page_state: any }

// A single progress target.  `url` omitted ⇒ the token-bound "self" activity;
// entries with a `url` are activities this one reports a calculation against.
export type ProgressUpdate = { url?: string; progress: number }
export type ProgressResult = { url: string; progress: number }
type ProgressResponse = { progress: number; others?: ProgressResult[] }

// The single unified agent activity-state endpoint.
const AGENT_ACTIVITY_URL = '/routes/agent/activity'

type ApiRequestResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'network-error'; error: string }
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

      return { status: 'server-error', code: response.status, text: await response.text() }
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

  putProgress(updates: ProgressUpdate[]): Promise<ApiRequestResult<ProgressResponse>> {
    return this.#request({
      url: AGENT_ACTIVITY_URL,
      method: 'POST',
      data: { op: 'set-progress', updates },
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
