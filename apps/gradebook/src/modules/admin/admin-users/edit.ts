'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type AdminUserFormState, adminUserEditSchema } from './@types'

export async function editAdminUser(
  _prevState: AdminUserFormState,
  formData: FormData
): Promise<AdminUserFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = adminUserEditSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    given_name: formData.get('given_name'),
    family_name: formData.get('family_name'),
    email: formData.get('email'),
    password: formData.get('password'),
    is_enabled: formData.get('is_enabled'),
    roles: formData.get('roles'),
    previous_roles: formData.get('previous_roles'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update admin user.',
      status: 'failed',
    }
  }

  const { id, vid, given_name, family_name, email, password, is_enabled, roles, previous_roles } =
    validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.adminUsers.updateAdminUser(adminAuth, {
    id,
    vid,
    given_name,
    family_name,
    email,
    password,
    is_enabled,
    roles: roles.split(','),
    previous_roles: previous_roles.split(','),
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `Admin User Updated::${given_name} ${family_name} update successfully.`,
      {
        path: '/', // Adjust the path as needed
        httpOnly: config.cookies.flash.httpOnly,
        secure: config.cookies.flash.secure,
        sameSite: config.cookies.flash.sameSite,
        maxAge: 0,
      }
    )
    redirect(`/admin/admin-users/${id}`)
  }

  if (result.error.code === 'ERR_ADMIN_USER_EMAIL_CONFLICT') {
    return {
      errors: { email: ['Email address is in use.'] },
      message: 'An email address for this admin user already exists.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_VERSION_CONFLICT') {
    return {
      errors: {},
      message: 'This admin user is no longer up to date. Please reload the admin user.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This admin user can no longer be found..',
      status: 'failed',
    }
  }
  return {
    errors: {},
    message: 'Failed to update admin user.',
    status: 'failed',
  }
}
