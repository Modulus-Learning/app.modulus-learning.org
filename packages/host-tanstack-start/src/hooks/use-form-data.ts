// https://allanlasser.com/posts/2024-01-26-avoid-using-reacts-useformstatus
import { useTransition } from 'react'

import { useFormState } from 'react-dom'

export interface UseFormDataHook<FormState> {
  formState: FormState
  isPending: boolean
  formAction: (payload: FormData) => void
  onSubmit: (formData: FormData) => void
}

export function useFormData<FormState>(
  action: (formState: Awaited<FormState>, formData: FormData) => Promise<FormState>,
  initialState: Awaited<FormState>
): UseFormDataHook<FormState> {
  const [isPending, startTransition] = useTransition()
  const [formState, formAction] = useFormState(action, initialState)

  function onSubmit(formData: FormData): void {
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
