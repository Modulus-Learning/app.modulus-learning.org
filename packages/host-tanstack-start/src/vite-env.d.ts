/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_NAME: string
  readonly VITE_SITE_DESCRIPTION: string
  /** Read on the server at runtime only; never from `import.meta.env` on the client. */
  readonly VITE_PUBLIC_SERVER_URL: string
  readonly VITE_CSP_ENABLED: string
  readonly VITE_RECAPTCHA_ENABLED: string
  readonly VITE_RECAPTCHA_MANDATORY: string
  readonly VITE_RECAPTCHA_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
