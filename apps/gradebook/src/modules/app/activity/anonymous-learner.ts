// 'use server'

// import { stdSerializers } from 'pino'
// import { z } from 'zod'

// import { getServerConfig } from '@/config'
// import { getLogger } from '@/lib/logger'
// import { setSessionCookies } from '@/modules/app/session/session-old'
// import { type LearnerRegistrationFormState, learnerRegistrationFormSchema } from './@types'

// export const learnerRegistration = async (
//   _prevState: LearnerRegistrationFormState,
//   formData: FormData
// ): Promise<LearnerRegistrationFormState> => {
//   const logger = getLogger()
//   const config = getServerConfig()

//   const validationResult = learnerRegistrationFormSchema.safeParse({
//     username: formData.get('username'),
//   })

//   if (!validationResult.success) {
//     return {
//       errors: z.flattenError(validationResult.error).fieldErrors,
//       message: 'Missing or invalid fields in form.',
//       status: 'failed',
//     }
//   }

//   const { username } = validationResult.data

//   const REGISTRATION_URL = `${config.api.baseUrl}/activity/learner-registration`

//   try {
//     const response = await fetch(REGISTRATION_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Accept: 'application/json',
//       },
//       body: JSON.stringify({ username }),
//     })

//     const result = await response.json()

//     if (response.ok === false) {
//       // TODO: refactor error handling.
//       if (result?.errors != null && result?.errors?.length > 0) {
//         if (result.errors.some((item: any) => item.code === 'ERR_NOT_FOUND')) {
//           return {
//             errors: {},
//             status: 'failed',
//             message: 'There was an error registering. Please contact your instructor.',
//           }
//         }
//         return {
//           errors: {},
//           status: 'failed',
//           message: 'There was an error registering. Please contact your instructor.',
//         }
//       }
//       return {
//         errors: {},
//         status: 'failed',
//         message: 'There was an error registering. Please contact your instructor.',
//       }
//     }

//     const { access_token, refresh_token } = result
//     await setSessionCookies({ access_token, refresh_token, remember_me: false })

//     return {
//       errors: {},
//       status: 'success',
//     }
//   } catch (error) {
//     logger.error({
//       activity: {
//         status: 'failed',
//         message: 'error in startActivity',
//         method: 'startActivity',
//         error: stdSerializers.err(error as Error),
//       },
//     })
//     return { errors: {}, status: 'failed', message: 'An error occurred.' }
//   }
// }
