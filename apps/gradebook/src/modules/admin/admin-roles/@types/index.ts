import { integerFromStringSchema, uuidSchema } from '@infonomic/schemas'
import { z } from 'zod'

export interface AdminRolesResponse {
  roles: AdminRole[] | null
}

export interface AdminRole {
  id: string
  vid: number
  machine_name: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface AdminPermission {
  id: string
  vid: number
  ability: string
  created_at: string
  updated_at: string
}

export interface AdminRoleResponse {
  role: AdminRole | null
  permissions: AdminPermission[] | null
}

export interface AdminRoleFormState {
  errors: {
    name?: string[] | undefined
    machine_name?: string[] | undefined
    description?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface AdminRoleOrderState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface AdminRoleDeleteState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const adminRoleCreateSchema = z.object({
  name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Name is required.' : 'Name must be a string.',
    })
    .min(3, {
      error: 'Name must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Name must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Name cannot be empty.'),
  machine_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Machine name is required.' : 'Machine name must be a string.',
    })
    .min(3, {
      error: 'Machine name must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Machine name must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Machine name cannot be empty.'),
  description: z
    .string()
    .min(3, {
      error: 'Description must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Description must not be greater than 256 characters.',
    })
    .optional(),
})

export const adminRoleEditSchema = z.object({
  id: uuidSchema,
  vid: integerFromStringSchema,
  name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Name is required.' : 'Name must be a string.',
    })
    .min(3, {
      error: 'Name must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Name must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Name cannot be empty.'),
  machine_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Machine name is required.' : 'Machine name must be a string.',
    })
    .min(3, {
      error: 'Machine name must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Machine name must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Machine name cannot be empty.'),
  description: z
    .string()
    .min(3, {
      error: 'Description must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Description must not be greater than 256 characters.',
    })
    .optional(),
})

export const adminRoleDeleteSchema = z.object({
  roleId: z.uuid(),
  name: z.string(),
})

export const adminRoleOrderSchema = z.object({
  ids: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.uuid().array()),
})
