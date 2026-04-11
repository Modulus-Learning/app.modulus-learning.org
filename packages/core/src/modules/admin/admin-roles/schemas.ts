import { z } from 'zod'

//////////////////////////////////////////////////
// Requests
//////////////////////////////////////////////////

export const getAdminRoleRequestSchema = z.object({
  id: z.uuid(),
})

export type GetAdminRoleRequest = z.infer<typeof getAdminRoleRequestSchema>

export const createAdminRoleRequestSchema = z.object({
  name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Name is required.' : undefined),
    })
    .min(3, 'Name is required.')
    .max(50, 'Name must not be greater than 50 characters.'),
  machine_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Machine name is required.' : undefined),
    })
    .min(3, 'Machine is required.')
    .max(50, 'Machine name must not be greater than 50 characters.'),
  description: z
    .string()
    .min(3, 'Description must be greater that three characters.')
    .max(50, 'Description must not be greater than 256 characters.')
    .optional(),
})

export type CreateAdminRoleRequest = z.infer<typeof createAdminRoleRequestSchema>

export const updateAdminRoleRequestSchema = z.object({
  id: z.uuid(),
  vid: z.number(),
  name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Name is required.' : undefined),
    })
    .min(3, 'Name is required.')
    .max(50, 'Name must not be greater than 50 characters.'),
  machine_name: z
    .string({
      error: (issue) => (issue.input === undefined ? 'Machine name is required.' : undefined),
    })
    .min(3, 'Machine is required.')
    .max(50, 'Machine name must not be greater than 50 characters.'),
  description: z
    .string()
    .min(3, 'Description must be greater that three characters.')
    .max(50, 'Description must not be greater than 256 characters.')
    .optional(),
})

export type UpdateAdminRoleRequest = z.infer<typeof updateAdminRoleRequestSchema>

export const deleteAdminRoleRequestSchema = z.object({
  id: z.uuid(),
})

export type DeleteAdminRoleRequest = z.infer<typeof deleteAdminRoleRequestSchema>

export const updateAdminRolesOrderRequestSchema = z.object({
  ids: z.uuid().array(),
})

export type UpdateAdminRolesOrderRequest = z.infer<typeof updateAdminRolesOrderRequestSchema>

//////////////////////////////////////////////////
// Responses
//////////////////////////////////////////////////

export const adminRoleSchema = z.object({
  id: z.string(),
  order: z.number(),
  vid: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  machine_name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type AdminRole = z.infer<typeof adminRoleSchema>

export const adminPermissionSchema = z.object({
  id: z.string(),
  vid: z.number(),
  ability: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type AdminPermission = z.infer<typeof adminPermissionSchema>

export const adminRoleListResponseSchema = z.object({
  roles: adminRoleSchema.array(),
})

export type AdminRoleListResponse = z.infer<typeof adminRoleListResponseSchema>

export const adminRoleResponseSchema = z.object({
  role: adminRoleSchema,
  permissions: adminPermissionSchema.array(),
})

export type AdminRoleResponse = z.infer<typeof adminRoleResponseSchema>
