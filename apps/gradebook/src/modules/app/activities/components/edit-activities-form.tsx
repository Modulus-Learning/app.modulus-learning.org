'use client'

import type { ChangeEvent } from 'react'
import { startTransition, useActionState, useId, useState } from 'react'

import { Button, ErrorText, TextArea } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import { validateUrls } from '../@types/validate-urls'
import { updateActivityCode } from '../update-activity-code'
import type { Locale } from '@/i18n/i18n-config'
import type { Activity, ActivityCode, ActivityCodeFormState } from '../@types'

const initialState: ActivityCodeFormState = { errors: {}, status: 'idle' }

export function EditActivitiesForm({
  activityCode,
  activities,
  lng,
}: {
  activityCode: ActivityCode
  activities: Activity[]
  lng: Locale
}): React.JSX.Element {
  const [formState, formAction, isPending] = useActionState(updateActivityCode, initialState)
  const [urlError, setUrlError] = useState(false)
  const [urlErrorText, setUrlErrorText] = useState('')
  const textAreaId = useId()
  const errorTextId = useId()

  const activityUrls = activities.map((activity) => activity.url).join('\n')

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

  return (
    <div className="flex flex-col">
      {formState.status === 'failed' && (
        <ErrorText
          id={errorTextId}
          text={formState.message || 'There was an error updating activities.'}
          className="mb-2"
        />
      )}
      <form onSubmit={handleOnSubmit}>
        <input type="hidden" name="private_code" value={activityCode.private_code} />
        <div className="mt-2">
          <TextArea
            onChange={handleUrlChange}
            id={textAreaId}
            defaultValue={activityUrls}
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
          <Button
            render={
              <LangLink
                href={`/dashboard/activity-code/${activityCode.private_code}/activities`}
                lng={lng}
              />
            }
            intent="noeffect"
          >
            Cancel
          </Button>

          <Button type="submit" disabled={isPending || urlError}>
            {isPending ? 'Updating...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}
