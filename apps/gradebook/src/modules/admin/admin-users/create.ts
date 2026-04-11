'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type AdminUserFormState, adminUserCreateSchema } from './@types'

export async function createAdminUser(
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

  const validatedFields = adminUserCreateSchema.safeParse({
    given_name: formData.get('given_name'),
    family_name: formData.get('family_name'),
    email: formData.get('email'),
    password: formData.get('password'),
    roles: formData.get('roles'),
    send_welcome: formData.get('send_welcome'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to create admin user.',
      status: 'failed',
    }
  }

  const { given_name, family_name, email, password, roles, send_welcome } = validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.adminUsers.createAdminUser(adminAuth, {
    given_name,
    family_name,
    email,
    password,
    roles: roles.split(','),
    send_welcome,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `Admin User Created::${given_name} ${family_name} created successfully.`,
      {
        path: '/', // Adjust the path as needed
        httpOnly: config.cookies.flash.httpOnly,
        secure: config.cookies.flash.secure,
        sameSite: config.cookies.flash.sameSite,
        maxAge: 0,
      }
    )

    redirect('/admin/admin-users')
  }

  if (result.error.code === 'ERR_ADMIN_USER_EMAIL_CONFLICT') {
    return {
      errors: { email: ['Email address is in use.'] },
      message: 'An email address for this admin user already exists.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to create admin user.',
    status: 'failed',
  }
}
