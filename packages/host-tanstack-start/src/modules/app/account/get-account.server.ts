import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'

export async function getAccount(_locale: Locale) {
  const userAuth = await getCoreUserRequestContext()
  if (!userAuth) {
    return null
  }

  const core = await getCoreCommands()
  const result = await core.app.account.getAccount(userAuth)

  if (result.ok) {
    return result.data
  }

  return null
}
