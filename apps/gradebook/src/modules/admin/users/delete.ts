'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type UserDeleteState, userDeleteSchema } from './@types'

export async function deleteUser(
  _prevState: UserDeleteState,
  formData: FormData
): Promise<UserDeleteState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validationResult = userDeleteSchema.safeParse({
    userId: formData.get('userId'),
    full_name: formData.get('full_name'),
  })

  if (!validationResult.success) {
    return {
      message: 'Unable to delete user.',
      status: 'failed',
    }
  }

  const { userId, full_name } = validationResult.data

  const core = await getCoreInstance()
  const result = await core.admin.users.deleteUser(adminAuth, { id: userId })

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()
    cookieJar.set(config.cookies.flash.name, `User Deleted::${full_name} deleted successfully.`, {
      path: '/', // Adjust the path as needed
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    })

    redirect('/admin/users')
  }

  return {
    message: 'User delete failed.',
    status: 'failed',
  }
}
