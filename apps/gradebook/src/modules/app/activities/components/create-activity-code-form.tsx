'use client'

import type { ChangeEvent } from 'react'
import { startTransition, useActionState, useId, useState } from 'react'

import { Button, ErrorText, TextArea } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import { validateUrls } from '../@types/validate-urls'
import { createActivityCode } from '../create-activity-code'
import { RequestActivityCodeForm } from './request-activity-code-form'
import type { Locale } from '@/i18n/i18n-config'
import type { ActivityCodeFormState } from '../@types'

const initialState: ActivityCodeFormState = { errors: {}, status: 'idle' }

export function CreateActivityCodeForm({ lng }: { lng: Locale }): React.JSX.Element {
  const [formState, formAction, isPending] = useActionState(createActivityCode, initialState)
  const [urlError, setUrlError] = useState(false)
  const [codeError, setCodeError] = useState(false)
  const [urlErrorText, setUrlErrorText] = useState('')
  const [activityCode, setActivityCode] = useState<string>('')
  const textAreaId = useId()
  const errorTextId = useId()

  const handleUrlChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    if (value.trim() === '') {
      setUrlError(false)
      setUrlErrorText('')
      return
    }

    const lines = value.split('\n')
    const result = validateUrls(lines)
    if (!result.valid) {
      setUrlError(true)
      setUrlErrorText(result.message)
      return
    }

    setUrlError(false)
    setUrlErrorText('')
  }

  const handleRequestedCode = (code: string): void => {
    setActivityCode(code)
    console.log('Activity code requested:', code)
  }

  const handleOnSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (activityCode.trim() === '') {
      setCodeError(true)
      return
    }
    setCodeError(false)
    try {
      const formData = new FormData(event.currentTarget)
      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  return (
    <div className="flex flex-col">
      {formState.status === 'failed' && (
        <ErrorText
          id={errorTextId}
          text={formState.message || 'There was an error submitting your activity code.'}
          className="mb-2"
        />
      )}
      <RequestActivityCodeForm
        error={codeError}
        errorText="Please request an activity code first."
        onRequested={handleRequestedCode}
      />
      <form onSubmit={handleOnSubmit}>
        <input type="hidden" name="activity_code" value={activityCode} />
        <div className="mt-2">
          <TextArea
            onChange={handleUrlChange}
            id={textAreaId}
            name="urls"
            rows={10}
            label="Activity URLs"
            placeholder="Enter one or more destination activity URLs for this activity code."
            className="w-full"
            helpText="Enter one or more destination activity URLs for this activity code. Note that you will be able to add or remove more URLs later."
            error={urlError}
            errorText={urlErrorText}
          />
        </div>
        <div className="form-actions flex items-center justify-end mt-4 gap-4">
          <Button render={<LangLink href="/dashboard" lng={lng} />} intent="noeffect">
            Cancel
          </Button>

          <Button type="submit" disabled={isPending || urlError}>
            {isPending ? 'Creating...' : 'Create Activity Code'}
          </Button>
        </div>
      </form>
    </div>
  )
}
