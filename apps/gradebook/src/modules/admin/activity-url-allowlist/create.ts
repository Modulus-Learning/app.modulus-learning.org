'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type AllowlistRuleFormState, allowlistRuleCreateSchema } from './@types'

export async function createAllowlistRule(
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

  const validatedFields = allowlistRuleCreateSchema.safeParse({
    base_url: formData.get('base_url'),
    description: formData.get('description'),
  })

  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to create allowlist rule.',
      status: 'failed',
    }
  }

  const { base_url, description } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.createAllowlistRule(adminAuth, {
    base_url,
    description,
  })

  if (result.ok) {
    // A collision is an ordinary outcome of an ordinary submission, because
    // normalization collapses several spellings onto one base. Nothing was
    // written, and neither case is an error: report what already exists and
    // let the administrator decide.
    if (result.data.status !== 'created') {
      return {
        errors: {},
        existing: result.data.rule,
        status: result.data.status,
      }
    }

    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `Allowlist Rule Created::${result.data.rule.base_url} can now be registered.`,
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

  if (result.error.code === 'ERR_VALIDATION') {
    return {
      errors: { base_url: [result.error.message] },
      message: 'Unable to create allowlist rule.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to create allowlist rule.',
    status: 'failed',
  }
}
