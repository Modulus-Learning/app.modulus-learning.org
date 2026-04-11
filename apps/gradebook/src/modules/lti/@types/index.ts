export type DeepLinkingFormState = {
  errors?: {
    activity_url?: string[]
    activity_code?: string[]
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
  result?: { jwt: string; return_url: string }
}
