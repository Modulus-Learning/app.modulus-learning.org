'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type AllowlistRuleDeleteState, allowlistRuleDeleteSchema } from './@types'

/**
 * Deletes a rule.
 *
 * This withdraws the base URL from future admissions and does nothing else. No
 * activity is removed, no association is dropped, and nothing already
 * registered stops working.
 */
export async function deleteAllowlistRule(
  _prevState: AllowlistRuleDeleteState,
  formData: FormData
): Promise<AllowlistRuleDeleteState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validationResult = allowlistRuleDeleteSchema.safeParse({
    id: formData.get('id'),
    base_url: formData.get('base_url'),
  })

  if (validationResult.success === false) {
    return {
      message: 'Unable to delete allowlist rule.',
      status: 'failed',
    }
  }

  const { id, base_url } = validationResult.data

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.deleteAllowlistRule(adminAuth, { id })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `Allowlist Rule Deleted::${base_url} removed from the allowlist. Existing activities are unaffected.`,
      {
        path: '/',
        httpOnly: config.cookies.flash.httpOnly,
        secure: config.cookies.flash.secure,
        sameSite: config.cookies.flash.sameSite,
        maxAge: 0,
      }
    )

    redirect('/admin/activities')
  }

  return {
    message: 'Allowlist rule delete failed.',
    status: 'failed',
  }
}
