'use client'

import type React from 'react'
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  ErrorText,
  LoaderEllipsis,
  Select,
} from '@infonomic/uikit/react'
import { normalizeActivityUrl } from '@modulus-learning/core/activity-url'

import { getPublicConfig } from '@/config'
import logoBlack from '@/images/logo/modulus-logo-symbol-black.svg'
import { validateDeepLinkActivityUrl } from '@/modules/app/activities/@types/validate-urls'
import { withSubmittedValues } from '@/modules/app/activities/with-submitted-values'
import { deepLinking } from '../actions/deep-linking-action'
import { DeepLinkingReturnForm } from './deep-linking-return-form'
import type { Activity, ActivityCode } from '@/modules/app/activities/@types'
import type { WithSubmittedValues } from '@/modules/app/activities/with-submitted-values'
import type { DeepLinkingFormState } from '../@types'

type SubmittedValues = { activity_code: string; activity_url: string }

const submitDeepLink = withSubmittedValues<DeepLinkingFormState, SubmittedValues>(deepLinking)

const initialState: WithSubmittedValues<DeepLinkingFormState, SubmittedValues> = {
  errors: {},
  status: 'idle',
}

type ActivityAutocompleteItem = Activity & { isPrefixSuggestion?: boolean }

type FieldErrors = { activity_url?: string; activity_code_id?: string }

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
  const config = getPublicConfig()

  const [formState, formAction, isPending] = useActionState(submitDeepLink, initialState)
  const [activityCode, setActivityCode] = useState('')
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [localErrors, setLocalErrors] = useState<FieldErrors>({})
  const fetchRef = useRef(0)

  const selectedActivityCode = useMemo(
    () => activityCodes.find((ac) => ac.code === activityCode),
    [activityCode, activityCodes]
  )

  useEffect(() => {
    if (!selectedActivityCode) {
      setActivities([])
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

  // Exact canonical identity against the loaded list: `HTTPS://Content.test/a`
  // is the stored `https://content.test/a`, not a new activity. This is not a
  // search or a near-match suggestion.
  const isNewUrl = useMemo(() => {
    const key = normalizeActivityUrl(inputValue.trim())
    if (key == null) return false
    return !activities.some((a) => normalizeActivityUrl(a.url) === key)
  }, [inputValue, activities])

  const autocompleteItems = useMemo<ActivityAutocompleteItem[]>(() => {
    const urlPrefix = selectedActivityCode?.url_prefix?.trim() ?? ''
    if (urlPrefix === '') {
      return activities
    }

    const prefixKey = normalizeActivityUrl(urlPrefix)
    return [
      {
        id: `url-prefix-${selectedActivityCode?.id ?? 'activity-code'}`,
        url: urlPrefix,
        name: 'Use required URL prefix',
        created_at: '',
        updated_at: '',
        isPrefixSuggestion: true,
      },
      ...activities.filter(
        (activity) =>
          activity.url !== urlPrefix &&
          (prefixKey == null || normalizeActivityUrl(activity.url) !== prefixKey)
      ),
    ]
  }, [activities, selectedActivityCode])

  const handleActivityCodeChange = (value: string | null) => {
    setActivityCode(value ?? '')
    setInputValue('')
    setLocalErrors({})
  }

  // Validation runs on a committed selection and on submit only. Typing,
  // deleting, highlighting a suggestion, or moving focus away never reports
  // an error for a partial value; it only clears the field's local error.
  const handleAutocompleteValueChange = (value: string, details: { reason: string }) => {
    setInputValue(value)

    if (details.reason === 'item-press') {
      // The selected `value`, not `inputValue`: state set above is not
      // readable until the next render.
      setLocalErrors(validateDeepLinkActivityUrl(value, selectedActivityCode?.url_prefix))
    } else {
      setLocalErrors(({ activity_code_id }) => ({ activity_code_id }))
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Always validate before the action runs -- including a value typed and
    // submitted with Enter without selecting an item, and with no prefix.
    // Without a code the URL field is not rendered, so say what is missing on
    // the field that is.
    const errors: FieldErrors =
      selectedActivityCode == null
        ? { activity_code_id: 'Select an activity code.' }
        : validateDeepLinkActivityUrl(inputValue, selectedActivityCode.url_prefix)
    setLocalErrors(errors)
    if (errors.activity_url != null || errors.activity_code_id != null) {
      return
    }

    // Dispatched by hand rather than through `<form action>`: React resets a
    // form after an action submitted that way, which would clear the chosen
    // code on a failed submission.
    const formData = new FormData(event.currentTarget)
    startTransition(() => {
      formAction({
        formData,
        submitted: { activity_code: activityCode, activity_url: inputValue.trim() },
      })
    })
  }

  // A server error describes the values that were submitted, so it is shown
  // only while the form still holds them. A response that arrives after the
  // instructor changed the URL or the code can neither attach its error to
  // the new value nor disable Submit for it.
  const submittedCode = formState.submitted?.activity_code === activityCode
  const submittedUrl = submittedCode && formState.submitted?.activity_url === inputValue.trim()
  const activityUrlError =
    localErrors.activity_url ?? (submittedUrl ? formState.errors?.activity_url?.[0] : undefined)
  const activityCodeError =
    localErrors.activity_code_id ??
    (submittedCode ? formState.errors?.activity_code_id?.[0] : undefined)
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
          <form noValidate onSubmit={handleSubmit}>
            <input type="hidden" id="launch_id" name="launch_id" value={launchId} />
            <input type="hidden" name="activity_code_id" value={selectedActivityCode?.id ?? ''} />
            <input type="hidden" name="activity_url" value={inputValue.trim()} />
            {activityCodes.length > 0 ? (
              <>
                <div className="mb-4">
                  <Select
                    id="activity_code_select"
                    placeholder="Select an activity code"
                    size="sm"
                    value={activityCode === '' ? null : activityCode}
                    onValueChange={handleActivityCodeChange}
                    helpText="Select an activity code, and then select or enter an activity URL below."
                    items={activityCodes.map((ac) => ({
                      value: ac.code,
                      label: ac.code,
                    }))}
                  />
                  {activityCodeError != null && (
                    <ErrorText id="activity_code_id_error" text={activityCodeError} />
                  )}
                </div>
                {activityCode && (
                  <>
                    {selectedActivityCode?.description != null &&
                      selectedActivityCode.description.length > 0 && (
                        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          <p className="mb-1 font-medium text-gray-900">About this activity code</p>
                          <p className="whitespace-pre-line">{selectedActivityCode.description}</p>
                        </div>
                      )}
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
                  </>
                )}
              </>
            ) : (
              <div className="mb-4 p-3 rounded-md border border-gray-200 text-sm text-gray-600">
                <p className="mb-2">You don't have any activity codes yet.</p>
                <a
                  href={new URL('dashboard', config.publicServerUrl).toString()}
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
