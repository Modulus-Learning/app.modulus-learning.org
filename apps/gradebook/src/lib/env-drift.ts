/**
 * Build-time vs runtime drift in the client-inlined `VITE_*` values.
 *
 * Vite bakes `import.meta.env.VITE_*` into the bundle at build time, but an
 * operator can still set the same keys at runtime (a Fly toml, say) and expect
 * the browser to see them. The server reads the runtime value, so the two can
 * disagree silently. `VITE_PUBLIC_SERVER_URL` is excluded: it is read at
 * runtime and delivered to the client through the root loader, by design.
 */
export const BAKED_PUBLIC_ENV: Record<string, string | undefined> = {
  VITE_SITE_NAME: import.meta.env.VITE_SITE_NAME,
  VITE_SITE_DESCRIPTION: import.meta.env.VITE_SITE_DESCRIPTION,
  VITE_CSP_ENABLED: import.meta.env.VITE_CSP_ENABLED,
  VITE_RECAPTCHA_ENABLED: import.meta.env.VITE_RECAPTCHA_ENABLED,
  VITE_RECAPTCHA_MANDATORY: import.meta.env.VITE_RECAPTCHA_MANDATORY,
  VITE_RECAPTCHA_SITE_KEY: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
}

/** Keys whose runtime value is set and differs from the value baked into the build. */
export const findPublicEnvDrift = (
  baked: Record<string, string | undefined> = BAKED_PUBLIC_ENV,
  runtime: Record<string, string | undefined> = process.env
): string[] =>
  Object.entries(baked)
    .filter(([key, value]) => runtime[key] !== undefined && runtime[key] !== value)
    .map(([key]) => key)
