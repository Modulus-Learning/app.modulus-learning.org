'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type UserFormState, userCreateSchema } from './@types'

export async function createUser(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = userCreateSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    password: formData.get('password'),
    roles: formData.get('roles'),
    send_welcome: formData.get('send_welcome'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to create user.',
      status: 'failed',
    }
  }

  const { full_name, email, password, roles, send_welcome } = validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.users.createUser(adminAuth, {
    full_name,
    email,
    password,
    roles: roles.split(','),
    send_welcome,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(config.cookies.flash.name, `User Created::${full_name} created successfully.`, {
      path: '/', // Adjust the path as needed
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    })

    redirect('/admin/users')
  }

  if (result.error.code === 'ERR_USER_EMAIL_CONFLICT') {
    return {
      errors: { email: ['Email address is in use.'] },
      message: 'An email address for this user already exists.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to create user.',
    status: 'failed',
  }
}
