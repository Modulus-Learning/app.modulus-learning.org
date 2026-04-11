'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type RoleDeleteState, roleDeleteSchema } from './@types'

export async function deleteRole(
  _prevState: RoleDeleteState,
  formData: FormData
): Promise<RoleDeleteState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validationResult = roleDeleteSchema.safeParse({
    roleId: formData.get('roleId'),
    name: formData.get('name'),
  })

  if (validationResult.success === false) {
    return {
      message: 'Unable to delete admin role.',
      status: 'failed',
    }
  }

  const { roleId, name } = validationResult.data

  const core = await getCoreInstance()
  const result = await core.admin.roles.deleteRole(adminAuth, { id: roleId })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(config.cookies.flash.name, `Role Deleted::${name} role deleted successfully.`, {
      path: '/', // Adjust the path as needed
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    })

    redirect('/admin/roles')
  }

  return {
    message: 'Role delete failed',
    status: 'failed',
  }
}
