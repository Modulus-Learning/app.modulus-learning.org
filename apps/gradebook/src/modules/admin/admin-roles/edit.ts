'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type AdminRoleFormState, adminRoleEditSchema } from './@types'

export async function editAdminRole(
  _prevState: AdminRoleFormState,
  formData: FormData
): Promise<AdminRoleFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = adminRoleEditSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    name: formData.get('name'),
    machine_name: formData.get('machine_name'),
    description: formData.get('description'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update admin role.',
      status: 'failed',
    }
  }

  const { id, vid, name, machine_name, description } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.adminRoles.updateAdminRole(adminAuth, {
    id,
    vid,
    name,
    machine_name,
    description,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `Admin Role Updated::${name} role update successfully.`,
      {
        path: '/', // Adjust the path as needed
        httpOnly: config.cookies.flash.httpOnly,
        secure: config.cookies.flash.secure,
        sameSite: config.cookies.flash.sameSite,
        maxAge: 0,
      }
    )

    redirect(`/admin/admin-roles/${id}`)
  }

  if (result.error.code === 'ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT') {
    return {
      errors: { machine_name: ['Machine name is in use.'] },
      message: 'An admin role with this machine name already exists.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_VERSION_CONFLICT') {
    return {
      errors: {},
      message: 'This admin role is no longer up to date. Please reload the admin role.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This admin role can no longer be found.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update admin role.',
    status: 'failed',
  }
}
