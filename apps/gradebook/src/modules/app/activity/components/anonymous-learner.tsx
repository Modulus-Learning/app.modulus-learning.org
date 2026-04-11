// 'use client'

// import { Button, Input } from '@infonomic/uikit/react'
// import { useActionState } from 'react'
// import type { LearnerRegistrationFormState } from '../@types'
// import { learnerRegistration } from '../anonymous-learner'

// import { useTranslations } from '@/i18n/client/translations-provider'

// const initialState: LearnerRegistrationFormState = { errors: {}, status: 'idle' }

// export function LearnerRegistrationForm(): React.JSX.Element {
//   const { t } = useTranslations('common')
//   const [formState, formAction, isPending] = useActionState(learnerRegistration, initialState)
//   return (
//     <div className="flex flex-col mb-12">
//       <div className="w-full bg-white rounded-lg shadow border md:mt-0 sm:max-w-[520px] xl:p-0 dark:bg-canvas-900 dark:border-gray-600">
//         <div className="p-6 sm:p-7">
//           <h2 className="!m-0 !mb-4 text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl dark:text-white">
//             {/* @ts-expect-error missing translations */}
//             {t('Learner Registration')}
//           </h2>
//           <p>
//             Before we redirect you to the activity page please enter a username or handle so that
//             the instructor of this activity will recognize you and can see your progress. You may
//             use your name, or a pseudonym. Please check with your instructor.
//           </p>
//           <form action={formAction} noValidate>
//             <Input
//               required
//               id="username"
//               label="Username"
//               placeholder="Username"
//               helpText="Enter a nickname or username."
//               name="username"
//               error={Boolean(formState.errors.username)}
//               errorText={formState.errors.username?.[0]}
//             />
//             <div className="actions flex gap-2 items-center justify-end">
//               <Button type="submit">Start!</Button>
//             </div>
//           </form>
//         </div>
//       </div>
//     </div>
//   )
// }
