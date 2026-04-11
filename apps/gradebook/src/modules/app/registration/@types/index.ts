import { passwordSchema } from '@infonomic/schemas'
import { object, string } from 'zod'

export const registrationStep1Schema = object({
  full_name: string({
    error: (issue) => (issue.input === undefined ? 'Name is required.' : undefined),
  })
    .min(4, 'Full name is required.')
    .max(50, 'Full name must be less than 50 characters.'),
  email: string({
    error: (issue) => (issue.input === undefined ? 'Email is required.' : undefined),
  })
    .min(1, 'Please enter your email address.')
    .email('Please enter a valid email address.'),
  agree_to_terms: string({
    error: (issue) => (issue.input === undefined ? 'Please agree to our terms of use.' : undefined),
  }),
})

export interface RegistrationStep1FormState {
  errors: {
    full_name?: string[]
    email?: string[]
    agree_to_terms?: string[]
    gtoken?: string[]
  }
  data?: {
    id: string
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const registrationStep2Schema = object({
  id: string({
    error: (issue) => (issue.input === undefined ? 'Missing required data.' : undefined),
  }),
  verification_code: string({
    error: (issue) => (issue.input === undefined ? 'Verification code is required.' : undefined),
  }).length(8, 'Please enter a valid verification code.'),
})

export interface RegistrationStep2FormState {
  errors: {
    verification_code?: string[]
  }
  data?: {
    id: string
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const registrationStep3Schema = object({
  id: string({
    error: (issue) => (issue.input === undefined ? 'Missing required data.' : undefined),
  }),
  password: passwordSchema,
  confirm_password: string({
    error: (issue) => (issue.input === undefined ? 'Please confirm your password.' : undefined),
  }),
  callback_url: string().optional(),
}).superRefine(({ confirm_password, password }, ctx) => {
  if (confirm_password !== password) {
    ctx.issues.push({
      code: 'custom',
      path: ['confirm_password'],
      error: 'Passwords did not match.',
      input: '',
    })
  }
})

export interface RegistrationStep3FormState {
  errors: {
    password?: string[]
    confirm_password?: string[]
  }
  data?: {
    id: string
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}
