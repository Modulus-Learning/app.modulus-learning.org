// Updated 2025-11-26 for Google Cloud reCAPTCHA Enterprise
export const reCaptchaExecute = async (
  enabled: boolean,
  siteKey: string,
  action: string
): Promise<string | undefined> => {
  // @ts-expect-error ignore missing types for grecaptcha.enterprise
  if (enabled === true && window.grecaptcha?.enterprise) {
    return new Promise((resolve) => {
      // @ts-expect-error ignore missing types for grecaptcha.enterprise
      window.grecaptcha.enterprise.ready(async () => {
        try {
          // @ts-expect-error ignore missing types for grecaptcha.enterprise
          const token = await window.grecaptcha.enterprise.execute(siteKey, { action })
          resolve(token)
        } catch (error) {
          console.error('reCAPTCHA execution failed', error)
          resolve(undefined)
        }
      })
    })
  }
  return undefined
}
