'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type UserFormState, userEditSchema } from './@types'

export async function editUser(
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

  const validatedFields = userEditSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    full_name: formData.get('full_name'),
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
      message: 'Unable to update user.',
      status: 'failed',
    }
  }

  const { id, vid, full_name, email, is_enabled, password, roles, previous_roles } =
    validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.users.updateUser(adminAuth, {
    id,
    vid,
    full_name,
    email,
    is_enabled,
    password,
    roles,
    previous_roles,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(config.cookies.flash.name, `User Updated::${full_name} update successfully.`, {
      path: '/', // Adjust the path as needed
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    })

    redirect(`/admin/users/${id}`)
  }

  if (result.error.code === 'ERR_USER_EMAIL_CONFLICT') {
    return {
      errors: { email: ['Email address is in use.'] },
      message: 'An email address for this user already exists.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_VERSION_CONFLICT') {
    return {
      errors: {},
      message: 'This user is no longer up to date. Please reload the user.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This user can no longer be found.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update user.',
    status: 'failed',
  }
}
