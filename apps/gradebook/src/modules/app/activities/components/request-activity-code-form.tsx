'use client'

import { startTransition, useActionState, useEffect, useRef } from 'react'

import { Button, ErrorText, Input, LoaderEllipsis } from '@infonomic/uikit/react'

import { useTheme } from '@/ui/theme/provider'
import { requestActivityCode } from '../request-activity-code'
import type { ActivityCodeRequestFormState } from '../@types'

const initialState: ActivityCodeRequestFormState = { errors: {}, status: 'idle', code: '' }

interface RequestActivityCodeFormProps {
  error: boolean // Explicitly type as client function
  errorText?: string // Optional error <text></text>
  onRequested: (code: string) => void // Explicitly type as client function
}

export function RequestActivityCodeForm({
  error = false,
  errorText = '',
  onRequested,
}: RequestActivityCodeFormProps): React.JSX.Element {
  const { theme } = useTheme()
  const [formState, formAction, isPending] = useActionState(requestActivityCode, initialState)
  const hasAutoRequestedRef = useRef(false)

  useEffect(() => {
    if (hasAutoRequestedRef.current) return
    if (formState.code) return
    hasAutoRequestedRef.current = true
    startTransition(() => {
      formAction(new FormData())
    })
  }, [formAction, formState.code])

  const handleOnSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    try {
      const formData = new FormData(event.currentTarget)
      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  useEffect(() => {
    if (formState.status === 'success') {
      if (onRequested !== null && typeof onRequested === 'function' && formState?.code) {
        onRequested(formState.code)
      }
    }
  }, [formState.status, formState?.code, onRequested])

  return (
    <form
      onSubmit={handleOnSubmit}
      autoComplete="off"
      noValidate
      action={formAction}
      className="flex flex-col gap-4"
    >
      <div className="mb-2">
        <div className="flex items-center gap-4">
          <Input
            inputSize="sm"
            id="activity-code"
            name="activity-code"
            type="text"
            readOnly
            required={true}
            value={formState?.code}
          />
          <Button size="sm" type="submit" disabled={isPending === true} className="min-w-[160px]">
            {isPending === true ? (
              <LoaderEllipsis size={22} color={theme === 'dark' ? '#000000' : '#FFFFFF'} />
            ) : (
              'Generate Activity Code'
            )}
          </Button>
        </div>
        {error && errorText && <ErrorText id="activity=code" text={errorText} />}
      </div>
    </form>
  )
}
