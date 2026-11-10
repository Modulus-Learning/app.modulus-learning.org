/**
 * A reading of Canvas's rate-limit quota headers, captured from a submission
 * response. `remaining` is `X-Rate-Limit-Remaining`; `cost` is `X-Request-Cost`
 * (absent on some responses). `at` is when it was observed (ms epoch). Feeds
 * the `QuotaGovernor`; core passes it through as an opaque scheduling signal.
 */
export type RateLimitReading = {
  remaining: number
  cost?: number
  at: number
}
