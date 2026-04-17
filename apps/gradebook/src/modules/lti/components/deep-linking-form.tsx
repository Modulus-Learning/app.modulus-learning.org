'use client'

import type React from 'react'
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  ErrorText,
  LoaderEllipsis,
  Select,
} from '@infonomic/uikit/react'

import logoBlack from '@/images/logo/modulus-logo-symbol-black.svg'
import { validateUrls } from '@/modules/app/activities/@types/validate-urls'
import { deepLinking } from '../actions/deep-linking-action'
import { DeepLinkingReturnForm } from './deep-linking-return-form'
import type { Activity, ActivityCode } from '@/modules/app/activities/@types'
import type { DeepLinkingFormState } from '../@types'

const initialState: DeepLinkingFormState = { errors: {}, status: 'idle' }

type ActivityAutocompleteItem = Activity & { isPrefixSuggestion?: boolean }

async function fetchActivities(activityCodeId: string): Promise<Activity[]> {
  const res = await fetch(
    `/routes/lti/deep-link/activities?id=${encodeURIComponent(activityCodeId)}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.activities ?? []
}

export function DeepLinkingForm({
  launchId,
  activityCodes,
}: {
  launchId: string
  activityCodes: ActivityCode[]
}): React.JSX.Element {
  const [formState, formAction, isPending] = useActionState(deepLinking, initialState)
  const [activityCode, setActivityCode] = useState('')
  const [activityUrl, setActivityUrl] = useState('')
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [activityUrlErrorText, setActivityUrlErrorText] = useState('')
  const fetchRef = useRef(0)

  const selectedActivityCode = useMemo(
    () => activityCodes.find((ac) => ac.code === activityCode),
    [activityCode, activityCodes]
  )

  useEffect(() => {
    if (!selectedActivityCode) {
      setActivities([])
      setActivityUrlErrorText('')
      return
    }

    const fetchId = ++fetchRef.current
    setIsLoadingActivities(true)
    setActivities([])

    fetchActivities(selectedActivityCode.id).then((result) => {
      if (fetchId === fetchRef.current) {
        setActivities(result)
        setIsLoadingActivities(false)
      }
    })
  }, [selectedActivityCode])

  const isNewUrl = useMemo(() => {
    if (!inputValue.trim()) return false
    return !activities.some((a) => a.url === inputValue.trim())
  }, [inputValue, activities])

  const autocompleteItems = useMemo<ActivityAutocompleteItem[]>(() => {
    const urlPrefix = selectedActivityCode?.url_prefix?.trim() ?? ''
    if (urlPrefix === '') {
      return activities
    }

    return [
      {
        id: `url-prefix-${selectedActivityCode?.id ?? 'activity-code'}`,
        url: urlPrefix,
        name: 'Use required URL prefix',
        created_at: '',
        updated_at: '',
        isPrefixSuggestion: true,
      },
      ...activities.filter((activity) => activity.url !== urlPrefix),
    ]
  }, [activities, selectedActivityCode])

  const getUrlPrefixError = useCallback((value: string, urlPrefix: string | null | undefined) => {
    const trimmedValue = value.trim()
    const normalizedPrefix = urlPrefix?.trim() ?? ''

    if (trimmedValue === '' || normalizedPrefix === '') {
      return ''
    }

    if (trimmedValue.startsWith(normalizedPrefix) || normalizedPrefix.startsWith(trimmedValue)) {
      return ''
    }

    return `Activity URL must start with ${normalizedPrefix}`
  }, [])

  const handleActivityCodeChange = (value: string | null) => {
    setActivityCode(value ?? '')
    setActivityUrl('')
    setInputValue('')
    setActivityUrlErrorText('')
  }

  const handleAutocompleteValueChange = useCallback(
    (value: string, details: { reason: string }) => {
      const trimmedValue = value.trim()
      setInputValue(value)
      setActivityUrlErrorText(getUrlPrefixError(trimmedValue, selectedActivityCode?.url_prefix))
      if (details.reason === 'item-press') {
        setActivityUrl(trimmedValue)
      } else if (details.reason === 'input-change') {
        setActivityUrl(trimmedValue)
      }
    },
    [getUrlPrefixError, selectedActivityCode]
  )

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const submittedUrl = activityUrl.trim()
    const urlPrefix = selectedActivityCode?.url_prefix?.trim() ?? ''

    if (submittedUrl === '' || urlPrefix === '') {
      setActivityUrlErrorText('')
      return
    }

    const validationResult = validateUrls([submittedUrl], urlPrefix)
    if (!validationResult.valid) {
      event.preventDefault()
      setActivityUrlErrorText(validationResult.message)
    }
  }

  const activityUrlError = activityUrlErrorText || formState.errors?.activity_url?.[0]
  const activityUrlHelpText =
    selectedActivityCode?.url_prefix != null && selectedActivityCode.url_prefix.length > 0
      ? `Required URL prefix: ${selectedActivityCode.url_prefix}`
      : undefined

  return formState.status === 'success' && formState.result != null ? (
    <DeepLinkingReturnForm jwt={formState.result.jwt} return_url={formState.result.return_url} />
  ) : (
    <div className="flex flex-col mb-12 items-center">
      <div className="w-full bg-white rounded-lg shadow border md:mt-0 sm:max-w-130 xl:p-0">
        <div className="p-6 sm:p-7">
          <h2 className="m-0! flex items-center gap-4 mb-4! text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl">
            <Image src={logoBlack} width={70} alt="Modulus" />{' '}
            <span>Create Modulus Activity Link</span>
          </h2>
          <form action={formAction} noValidate onSubmit={handleSubmit}>
            <input type="hidden" id="launch_id" name="launch_id" value={launchId} />
            <input type="hidden" name="activity_code" value={activityCode} />
            <input type="hidden" name="activity_url" value={activityUrl} />
            {activityCodes.length > 0 ? (
              <>
                <div className="mb-4">
                  <Select
                    id="activity_code_select"
                    placeholder="Select an activity code"
                    size="sm"
                    onValueChange={handleActivityCodeChange}
                    helpText="Select an activity code, and then select or enter an activity URL below."
                    items={activityCodes.map((ac) => ({
                      value: ac.code,
                      label: ac.code,
                    }))}
                  />
                  {formState.errors?.activity_code && (
                    <ErrorText id="activity_code_error" text={formState.errors.activity_code[0]} />
                  )}
                </div>
                {activityCode && (
                  <div className="mb-4">
                    {isLoadingActivities ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                        <LoaderEllipsis size={24} color="#9ca3af" />
                        <span>Loading activities...</span>
                      </div>
                    ) : (
                      <>
                        <Autocomplete<ActivityAutocompleteItem>
                          key={activityCode}
                          id="activity_url_autocomplete"
                          placeholder="Search or enter an activity URL"
                          inputSize="sm"
                          items={autocompleteItems}
                          value={inputValue}
                          onValueChange={handleAutocompleteValueChange}
                          error={activityUrlError != null && activityUrlError.length > 0}
                          errorText={activityUrlError}
                          helpText={activityUrlHelpText}
                        >
                          {(activity: ActivityAutocompleteItem) => (
                            <AutocompleteItem key={activity.id} value={activity.url}>
                              {activity.isPrefixSuggestion
                                ? `${activity.name}: ${activity.url}`
                                : activity.name
                                  ? `${activity.name} (${activity.url})`
                                  : activity.url}
                            </AutocompleteItem>
                          )}
                        </Autocomplete>
                        {isNewUrl && (
                          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <span className="mt-0.5 shrink-0 text-base leading-none">*</span>
                            <span>
                              This URL is new and will be registered as a valid activity for this
                              activity code if you proceed.
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="mb-4 p-3 rounded-md border border-gray-200 text-sm text-gray-600">
                <p className="mb-2">You don't have any activity codes yet.</p>
                <a
                  href="https://app.modulus-learning.org/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Go to the Modulus Dashboard to create one →
                </a>
              </div>
            )}
            <div className="actions flex gap-2 items-center justify-end">
              <Button
                type="submit"
                disabled={
                  isPending ||
                  activityCodes.length === 0 ||
                  (activityUrlError != null && activityUrlError.length > 0)
                }
              >
                Submit
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
