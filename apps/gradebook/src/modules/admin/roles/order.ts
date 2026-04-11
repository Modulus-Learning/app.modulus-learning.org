'use server'

import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type RoleOrderState, roleOrderSchema } from './@types'

export async function orderRoles(
  _prevState: RoleOrderState,
  formData: FormData
): Promise<RoleOrderState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = roleOrderSchema.safeParse({
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
  const result = await core.admin.roles.updateRolesOrder(adminAuth, { ids })

  if (result.ok) {
    return {
      message: 'Roles order has been updated.',
      status: 'success',
    }
  }

  return {
    message: 'Error updating roles order.',
    status: 'failed',
  }
}
