import { useEffect } from 'react'

import { usePublicConfig } from '@/config/provider'
import type { PublicConfig } from '@/config'

/**
  NOTE: This is a client-side JavaScript-dependent hook and helper for
  Google reCAPTCHA v3 https://developers.google.com/recaptcha/docs/v3
  The Google reCAPTCHA script will be injected into the client dynamically
  on client render in the browser. useEffect will only be called on 
  the client, and the helper reCaptchaExecute should only ever be called
  on the client via an event handler - like a click event from a button.

  It's likely that a better way to do this is via loader and link functions
  on the Remix route for the page using reCAPTCHA (like a login page and form,
  or a 'contact us' page and form). This would then support Remix's idea of
  'progressive enhancement' and no-js clients and environments.
 */

const defaultOptions = { action: 'default', callback: () => {} }

export const useReCaptcha = (options = defaultOptions): void => {
  const { recaptcha } = usePublicConfig()

  useEffect(() => {
    if (recaptcha.enabled) {
      const scriptElement = 'recaptcha-script'
      // recaptcha.net is in theory more accessible for Chinese users.
      const srcUrl = `https://www.recaptcha.net/recaptcha/api.js?render=${recaptcha.siteKey}`
      const element = document.getElementById(scriptElement)
      if (element == null) {
        const script = document.createElement('script')
        script.type = 'text/javascript'
        script.id = scriptElement
        script.onload = options.callback
        // src must come after onload
        script.src = srcUrl
        // const head = document.getElementsByTagName('head')[0]
        // head.appendChild(script)
        document.body.appendChild(script)
      } else {
        options.callback()
      }
    } else {
      options.callback()
    }
  }, [options, recaptcha.enabled, recaptcha.siteKey])
}

export const reCaptchaExecute = async (
  action: string,
  { recaptcha }: PublicConfig
): Promise<string> => {
  return await new Promise((resolve, reject) => {
    if (recaptcha.enabled) {
      // @ts-expect-error: we know this
      if (window.grecaptcha != null) {
        // @ts-expect-error: we know this
        window.grecaptcha.ready(() => {
          // @ts-expect-error: we know this
          window.grecaptcha.execute(recaptcha.siteKey, { action }).then((token: string) => {
            resolve(token)
          }, reject)
        })
      }
    } else {
      resolve('')
    }
  })
}
