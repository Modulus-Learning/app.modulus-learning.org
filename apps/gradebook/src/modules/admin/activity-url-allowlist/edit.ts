'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type AllowlistRuleFormState, allowlistRuleEditSchema } from './@types'

/**
 * Updates a rule's description and enabled state. Also the re-enable path for
 * a disabled rule a create submission collided with -- going through the update
 * is what keeps that rule's description and original author intact.
 *
 * A rule's base URL is never edited: changing it makes it a different rule, so
 * that is a delete plus a create.
 */
export async function editAllowlistRule(
  _prevState: AllowlistRuleFormState,
  formData: FormData
): Promise<AllowlistRuleFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = allowlistRuleEditSchema.safeParse({
    id: formData.get('id'),
    // `FormData.get` returns null for an absent key, which the schema rejects.
    // An absent description means "leave it alone", and core reads it that
    // way: `updateAllowlistRule` only sets the column when the field is not
    // undefined. This is what lets the re-enable path send `id` and
    // `is_enabled` alone and genuinely not touch the description -- which is
    // what the collision notice promises.
    description: formData.get('description') ?? undefined,
    is_enabled: formData.get('is_enabled'),
  })

  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update allowlist rule.',
      status: 'failed',
    }
  }

  const { id, description, is_enabled } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.updateAllowlistRule(adminAuth, {
    id,
    description,
    is_enabled,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `Allowlist Rule Updated::${result.data.rule.base_url} updated successfully.`,
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

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This allowlist rule can no longer be found.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update allowlist rule.',
    status: 'failed',
  }
}
