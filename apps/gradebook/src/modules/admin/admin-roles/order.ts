'use server'

import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type AdminRoleOrderState, adminRoleOrderSchema } from './@types'

export async function orderAdminRoles(
  _prevState: AdminRoleOrderState,
  formData: FormData
): Promise<AdminRoleOrderState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = adminRoleOrderSchema.safeParse({
    ids: formData.get('ids'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      message: 'Unable to update roles order.',
      status: 'failed',
    }
  }

  const { ids } = validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.adminRoles.updateAdminRolesOrder(adminAuth, { ids })

  if (result.ok) {
    return {
      message: 'Admin roles order has been updated.',
      status: 'success',
    }
  }

  return {
    message: 'Error updating admin roles order.',
    status: 'failed',
  }
}
