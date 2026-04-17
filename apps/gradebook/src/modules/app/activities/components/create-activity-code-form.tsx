'use client'

import type { ChangeEvent } from 'react'
import { startTransition, useActionState, useId, useState } from 'react'

import { Button, ErrorText, Input, TextArea } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import { validateUrlPrefix, validateUrls } from '../@types/validate-urls'
import { createActivityCode } from '../create-activity-code'
import { RequestActivityCodeForm } from './request-activity-code-form'
import type { Locale } from '@/i18n/i18n-config'
import type { ActivityCodeFormState } from '../@types'

const initialState: ActivityCodeFormState = { errors: {}, status: 'idle' }

export function CreateActivityCodeForm({ lng }: { lng: Locale }): React.JSX.Element {
  const [formState, formAction, isPending] = useActionState(createActivityCode, initialState)
  const [urlPrefix, setUrlPrefix] = useState('')
  const [urlsValue, setUrlsValue] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [urlPrefixError, setUrlPrefixError] = useState(false)
  const [codeError, setCodeError] = useState(false)
  const [urlErrorText, setUrlErrorText] = useState('')
  const [urlPrefixErrorText, setUrlPrefixErrorText] = useState('')
  const [activityCode, setActivityCode] = useState<string>('')
  const inputId = useId()
  const textAreaId = useId()
  const errorTextId = useId()

  const validateFormFields = (nextUrls: string, nextUrlPrefix: string): boolean => {
    const prefixResult = validateUrlPrefix(nextUrlPrefix)
    if (!prefixResult.valid) {
      setUrlPrefixError(true)
      setUrlPrefixErrorText(prefixResult.message)
    } else {
      setUrlPrefixError(false)
      setUrlPrefixErrorText('')
    }

    if (nextUrls.trim() === '') {
      setUrlError(false)
      setUrlErrorText('')
      return prefixResult.valid
    }

    const result = validateUrls(nextUrls.split('\n'), nextUrlPrefix)
    if (!result.valid) {
      setUrlError(true)
      setUrlErrorText(result.message)
      return false
    }

    setUrlError(false)
    setUrlErrorText('')
    return prefixResult.valid
  }

  const handleUrlChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    setUrlsValue(value)
    validateFormFields(value, urlPrefix)
  }

  const handleUrlPrefixChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setUrlPrefix(value)
    validateFormFields(urlsValue, value)
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
      const submittedUrls = formData.get('urls')
      const submittedUrlPrefix = formData.get('url_prefix')

      if (typeof submittedUrls !== 'string' || typeof submittedUrlPrefix !== 'string') {
        return
      }

      const isValid = validateFormFields(submittedUrls, submittedUrlPrefix)
      if (!isValid) {
        return
      }

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
          <Input
            id={inputId}
            name="url_prefix"
            type="text"
            value={urlPrefix}
            onChange={handleUrlPrefixChange}
            label="URL Prefix"
            placeholder="https://example.edu/course/"
            helpText="Optional. When set, every activity URL must start with this exact prefix. Use this for a domain, path, or full URL base."
            error={urlPrefixError}
            errorText={urlPrefixErrorText}
          />
        </div>
        <div className="mt-2">
          <TextArea
            onChange={handleUrlChange}
            id={textAreaId}
            value={urlsValue}
            name="urls"
            rows={10}
            label="Activity URLs"
            placeholder="Enter one or more destination activity URLs for this activity code."
            className="w-full"
            helpText="Enter one or more destination activity URLs for this activity code. If a required URL prefix is set above, every URL must begin with it."
            error={urlError}
            errorText={urlErrorText}
          />
        </div>
        <div className="form-actions flex items-center justify-end mt-4 gap-4">
          <Button render={<LangLink href="/dashboard" lng={lng} />} intent="noeffect">
            Cancel
          </Button>

          <Button type="submit" disabled={isPending || urlError || urlPrefixError}>
            {isPending ? 'Creating...' : 'Create Activity Code'}
          </Button>
        </div>
      </form>
    </div>
  )
}
