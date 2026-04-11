'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type AdminUserDeleteState, adminUserDeleteSchema } from './@types'

export async function deleteAdminUser(
  _prevState: AdminUserDeleteState,
  formData: FormData
): Promise<AdminUserDeleteState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validationResult = adminUserDeleteSchema.safeParse({
    userId: formData.get('userId'),
    given_name: formData.get('given_name'),
    family_name: formData.get('family_name'),
  })

  if (!validationResult.success) {
    return {
      message: 'Unable to delete admin user.',
      status: 'failed',
    }
  }

  const { userId, given_name, family_name } = validationResult.data

  const core = await getCoreInstance()
  const result = await core.admin.adminUsers.deleteAdminUser(adminAuth, { id: userId })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(
      config.cookies.flash.name,
      `User Deleted::${given_name} ${family_name} deleted successfully.`,
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

  return {
    message: 'Failed to delete admin user.',
    status: 'failed',
  }
}
