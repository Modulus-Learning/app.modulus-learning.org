'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type RoleFormState, roleCreateSchema } from './@types'

export async function createRole(
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

  const validatedFields = roleCreateSchema.safeParse({
    name: formData.get('name'),
    machine_name: formData.get('machine_name'),
    description: formData.get('description'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to create  role.',
      status: 'failed',
    }
  }

  const { name, machine_name, description } = validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.roles.createRole(adminAuth, {
    name,
    machine_name,
    description,
  })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()

    cookieJar.set(config.cookies.flash.name, `Role Created::${name} role created successfully.`, {
      path: '/', // Adjust the path as needed
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    })

    redirect('/admin/roles')
  }

  if (result.error.code === 'ERR_ROLE_MACHINE_NAME_CONFLICT') {
    return {
      errors: { machine_name: ['Machine name is in use.'] },
      message: 'A role with this machine name already exists.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to create role.',
    status: 'failed',
  }
}
