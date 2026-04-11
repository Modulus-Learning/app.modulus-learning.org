import { z } from 'zod'

//////////////////////////////////////////////////
// Requests
//////////////////////////////////////////////////

export const getRoleRequestSchema = z.object({
  id: z.uuid(),
})

export type GetRoleRequest = z.infer<typeof getRoleRequestSchema>

export const createRoleRequestSchema = z.object({
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

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>

export const updateRoleRequestSchema = z.object({
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

export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>

export const deleteRoleRequestSchema = z.object({
  id: z.uuid(),
})

export type DeleteRoleRequest = z.infer<typeof deleteRoleRequestSchema>

export const updateRolesOrderRequestSchema = z.object({
  ids: z.uuid().array(),
})

export type UpdateRolesOrderRequest = z.infer<typeof updateRolesOrderRequestSchema>

//////////////////////////////////////////////////
// Responses
//////////////////////////////////////////////////

export const roleSchema = z.object({
  id: z.string(),
  order: z.number(),
  vid: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  machine_name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type Role = z.infer<typeof roleSchema>

export const permissionSchema = z.object({
  id: z.string(),
  vid: z.number(),
  ability: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type Permission = z.infer<typeof permissionSchema>

export const roleListResponseSchema = z.object({
  roles: roleSchema.array(),
})

export type RoleListResponse = z.infer<typeof roleListResponseSchema>

export const roleResponseSchema = z.object({
  role: roleSchema,
  permissions: permissionSchema.array(),
})

export type RoleResponse = z.infer<typeof roleResponseSchema>
