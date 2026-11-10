export const reCaptchaExecute = async (
  enabled: boolean,
  siteKey: string,
  action: string
): Promise<string> => {
  return await new Promise((resolve, reject) => {
    if (enabled === true) {
      // @ts-expect-error ignore missing types for grecaptcha.enterprise
      if (window.grecaptcha != null) {
        // @ts-expect-error ignore missing types for grecaptcha.enterprise
        window.grecaptcha.ready(() => {
          // @ts-expect-error ignore missing types for grecaptcha.enterprise
          window.grecaptcha.execute(siteKey, { action }).then((token: string) => {
            resolve(token)
          }, reject)
        })
      }
    } else {
      resolve('')
    }
  })
}
