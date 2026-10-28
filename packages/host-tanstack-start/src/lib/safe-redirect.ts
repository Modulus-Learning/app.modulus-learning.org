/**
 * Guards against open redirects for post-auth "callback" targets.
 *
 * We accept only same-origin *relative* paths: a single leading slash. This
 * rejects absolute URLs (`https://evil.com`), protocol-relative URLs
 * (`//evil.com`), and the backslash form (`/\evil.com`) that some browsers
 * normalize to an absolute URL. Query and hash are preserved.
 */
export function isSafeCallbackPath(value: string): boolean {
  return value.length > 0 && value[0] === '/' && value[1] !== '/' && value[1] !== '\\'
}

/**
 * Returns `value` when it's a safe same-origin relative path, otherwise
 * `fallback`. Use at every point where a client-supplied callback is redirected
 * to.
 */
export function safeCallbackPath(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && isSafeCallbackPath(value) ? value : fallback
}
