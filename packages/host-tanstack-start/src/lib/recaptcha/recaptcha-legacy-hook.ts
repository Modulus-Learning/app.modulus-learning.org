import { useEffect } from 'react'

import { usePublicConfig } from '@/config/provider'

// https://www.google.com/u/1/recaptcha/admin/site/712950278
// Migrated to https://console.cloud.google.com/security/recaptcha

/**
  NOTE: This is a client-side JavaScript-dependent hook and helper for
  Google reCAPTCHA v3 https://developers.google.com/recaptcha/docs/v3
  The Google reCAPTCHA script will be injected into the client dynamically
  on client render in the browser. useEffect will only be called on 
  the client, and the helper reCaptchaExecute should only ever be called
  on the client via an event handler - like a click event from a button.

  It's likely that a better way to do this is via loader and link functions
  on the Remix/Next.js route for the page using reCAPTCHA (like a login page and form,
  or a 'contact us' page and form). This would then support Remix's idea of
  'progressive enhancement' and no-js clients and environments.
 */

const defaultOptions = { action: 'default', callback: () => {} }

// TODO: Not currently used - see reCaptchaExecute usage in mail-list-form.tsx and contact submission forms
export const useReCaptcha = (options = defaultOptions): void => {
  const publicConfig = usePublicConfig()
  useEffect(() => {
    const scriptElement = 'recaptcha-script'
    // const URL = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`
    // recaptcha.net is in theory more accessible for Chinese users.
    const URL = `https://www.recaptcha.net/recaptcha/api.js?render=${publicConfig.recaptcha.siteKey}`
    if (publicConfig.recaptcha.enabled === true) {
      const element = document.getElementById(scriptElement)
      if (element == null) {
        const script = document.createElement('script')
        script.type = 'text/javascript'
        script.id = scriptElement
        script.onload = options.callback
        // src must come after onload
        script.src = URL
        // const head = document.getElementsByTagName('head')[0]
        // head.appendChild(script)
        document.body.appendChild(script)
      } else {
        options.callback()
      }
    } else {
      options.callback()
    }
  }, [options, publicConfig.recaptcha.enabled, publicConfig.recaptcha.siteKey])
}
