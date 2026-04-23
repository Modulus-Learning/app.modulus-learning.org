'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type RoleFormState, roleEditSchema } from './@types'

export async function editRole(
  _prevState: RoleFormState,
  formData: FormData
): Promise<RoleFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = roleEditSchema.safeParse({
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
      message: 'Unable to update role.',
      status: 'failed',
    }
  }

  const { id, vid, name, machine_name, description } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.roles.updateRole(adminAuth, {
    id,
    vid,
    name,
    machine_name,
    description,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(config.cookies.flash.name, `Role Updated::${name} role update successfully.`, {
      path: '/', // Adjust the path as needed
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    })

    redirect(`/admin/roles/${id}`)
  }

  if (result.error.code === 'ERR_ROLE_MACHINE_NAME_CONFLICT') {
    return {
      errors: { machine_name: ['Machine name is in use.'] },
      message: 'An role with this machine name already exists.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_VERSION_CONFLICT') {
    return {
      errors: {},
      message: 'This role is no longer up to date. Please reload the role.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This role can no longer be found.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update role.',
    status: 'failed',
  }
}
