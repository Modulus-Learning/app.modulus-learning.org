// https://allanlasser.com/posts/2024-01-26-avoid-using-reacts-useformstatus
import { type SyntheticEvent, useTransition } from 'react'

import { useFormState } from 'react-dom'

export interface UseFormHook<FormState> {
  formState: FormState
  isPending: boolean
  formAction: (payload: FormData) => void
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void
}

export function useForm<FormState>(
  action: (formState: Awaited<FormState>, formData: FormData) => Promise<FormState>,
  initialState: Awaited<FormState>
): UseFormHook<FormState> {
  const [isPending, startTransition] = useTransition()
  const [formState, formAction] = useFormState(action, initialState)

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    // const formData = new FormData(event.currentTarget)
    // TODO - consider updating this hook to take the form data that has already
    // been processed by react-hook-form
    const formData = new FormData(event.target as HTMLFormElement)
    // console.log('Retrieved formData from event:', formData)
    startTransition(async () => {
      formAction(formData)
    })
  }

  return {
    formState,
    isPending,
    formAction,
    onSubmit,
  }
}
