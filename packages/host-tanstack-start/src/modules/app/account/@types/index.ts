import { integerFromStringSchema, passwordSchema, uuidSchema } from '@infonomic/schemas'
import { string, z } from 'zod'

import type { Locale } from '@/i18n/i18n-config'

export interface ActionProps {
  user: User
  lng: Locale
  onClose?: () => void
  onSuccess?: (response: UserResponse | null | undefined) => void
}

export interface User {
  id: string
  vid: number
  full_name: string | null
  email: string | null
  has_password: boolean
  github_id: number | null
  google_id: string | null
  lti_iss: string | null
  lti_sub: string | null
  last_provider: string | null
  last_login: string | null
  created_at: string
  updated_at: string
  is_enabled: boolean
  roles: string[]
}

export interface Role {
  id: string
  vid: number
  machine_name: string
  name: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface UserResponse {
  user: User | null
  included: {
    roles: Role[]
  }
}

export interface NameFormState {
  errors: {
    full_name?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
  response?: UserResponse | null
}

export const nameEditSchema = z.object({
  id: uuidSchema,
  vid: integerFromStringSchema,
  lng: z.string(),
  full_name: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Fullname is required.' : 'Fullname must be a string.',
    })
    .min(3, {
      error: 'Fullname must be 3 or more characters long.',
    })
    .max(50, {
      error: 'Fullname must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Fullname cannot be empty.'),
})

export interface ChangeEmailFormState {
  errors: {
    email?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
  email?: string
}

export const changeEmailSchema = z.object({
  id: uuidSchema,
  vid: integerFromStringSchema,
  lng: z.string(),
  email: string({
    error: (issue) => (issue.input === undefined ? 'Email is required.' : undefined),
  })
    .min(1, 'Email is required.')
    .email('Invalid email.'),
})

export interface VerifyEmailFormState {
  errors: {
    verification_code?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
  response?: UserResponse | null
}

export const verifyEmailSchema = z.object({
  id: uuidSchema,
  lng: z.string(),
  verification_code: string({
    error: (issue) =>
      issue.input === undefined
        ? 'Verification code is required.'
        : 'Verification code must be a string.',
  })
    .min(1, {
      error: 'Verification code is required.',
    })
    .max(50, {
      error: 'Verification code must not be greater than 50 characters.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Verification code cannot be empty.'),
})

export interface ChangePasswordFormState {
  errors: {
    current_password?: string[] | undefined
    new_password?: string[] | undefined
    confirm_password?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
  response?: UserResponse | null
}

export const changePasswordSchema = z
  .object({
    id: uuidSchema,
    vid: integerFromStringSchema,
    lng: z.string(),
    current_password: string({
      error: (issue) =>
        issue.input === undefined
          ? 'Current password is required.'
          : 'Current password must be a string.',
    })
      .min(1, {
        error: 'Current password is required.',
      })
      .max(50, {
        error: 'Current password must not be greater than 50 characters.',
      })
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, 'Current password cannot be empty.'),
    new_password: passwordSchema,
    confirm_password: string({
      error: (issue) =>
        issue.input === undefined ? 'Please confirm your new password.' : undefined,
    }),
  })
  .superRefine(({ confirm_password, new_password }, ctx) => {
    if (confirm_password !== new_password) {
      ctx.issues.push({
        code: 'custom',
        path: ['confirm_password'],
        error: 'Passwords did not match.',
        input: '',
      })
    }
  })

export interface SetPasswordFormState {
  errors: {
    password?: string[] | undefined
    confirm_password?: string[] | undefined
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
  response?: UserResponse | null
}

export const setPasswordSchema = z
  .object({
    id: uuidSchema,
    vid: integerFromStringSchema,
    lng: z.string(),
    password: passwordSchema,
    confirm_password: string({
      error: (issue) =>
        issue.input === undefined ? 'Please confirm your new password.' : undefined,
    }),
  })
  .superRefine(({ confirm_password, password }, ctx) => {
    if (confirm_password !== password) {
      ctx.issues.push({
        code: 'custom',
        path: ['confirm_password'],
        error: 'Passwords did not match.',
        input: '',
      })
    }
  })
