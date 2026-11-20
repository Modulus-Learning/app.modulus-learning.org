import { startTransition, useActionState, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { LangLink } from '@/framework'
import { useTheme } from '@/ui/theme/provider-base'
import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { ENDPOINT_FIELDS, ltiPlatformEditSchema } from '../@types'
import { suggestLtiPlatformEndpoints } from '../suggest-endpoints'
import { updateLtiPlatform } from '../update'
import { EndpointFields } from './endpoint-fields'
import type { Locale } from '@/i18n/i18n-config'
import type { LtiPlatform, LtiPlatformFormState } from '../@types'

interface LtiPlatformEditFormProps {
  lng: Locale
  data: { platform: LtiPlatform }
}

export function LtiPlatformEditForm({ data, lng }: LtiPlatformEditFormProps): React.JSX.Element {
  const { platform } = data
  const { theme } = useTheme()
  const initialState: LtiPlatformFormState = { message: undefined, errors: {}, status: 'idle' }
  const [formState, formAction, isPending] = useActionState(updateLtiPlatform, initialState)
  const resolver = zodResolver(ltiPlatformEditSchema)
  const {
    register,
    formState: { errors, isValid, isSubmitted },
    handleSubmit,
    setError,
    setValue,
  } = useForm({
    resolver,
    mode: 'onSubmit',
    // The issuer is immutable, so it is not part of the form's values.
    defaultValues: {
      id: platform.id,
      name: platform.name,
      client_id: platform.client_id,
      authorization_endpoint: platform.authorization_endpoint,
      token_endpoint: platform.token_endpoint,
      jwks_uri: platform.jwks_uri,
      authorization_server: platform.authorization_server,
    },
  })
  const [confirmingDefaults, setConfirmingDefaults] = useState<boolean>(false)
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false)
  const [suggestMessage, setSuggestMessage] = useState<string | undefined>(undefined)

  // Replaces all four endpoints; only after the inline confirmation.
  const handleReplaceWithDefaults = async (): Promise<void> => {
    setConfirmingDefaults(false)
    setIsSuggesting(true)
    setSuggestMessage(undefined)
    try {
      const result = await suggestLtiPlatformEndpoints(platform.issuer)
      if (!result.ok) {
        setSuggestMessage(result.message)
        return
      }
      for (const field of ENDPOINT_FIELDS) {
        setValue(field, result.endpoints[field], {
          shouldDirty: true,
          shouldValidate: isSubmitted,
        })
      }
    } catch (error) {
      console.error('Error suggesting endpoints:', error)
      setSuggestMessage('Failed to suggest endpoints.')
    } finally {
      setIsSuggesting(false)
    }
  }

  const handleOnSubmit = async (values: Record<string, any>): Promise<void> => {
    try {
      const formData = new FormData()
      for (const [key, value] of Object.entries(values)) {
        formData.append(key, value)
      }

      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  type ErrorKeys = keyof LtiPlatformFormState['errors']

  useEffect(() => {
    if (formState?.errors != null && Object.keys(formState.errors).length > 0) {
      const fields = Object.keys(formState.errors) as ErrorKeys[]
      for (const field of fields) {
        if (field === 'issuer') continue
        const errorMessage = getErrorText(field, null, formState.errors)
        setError(field, { message: errorMessage })
      }
    }
  }, [formState?.errors, setError])

  return (
    <div className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 p-5 pb-1 mb-8 mt-[4vh]">
      <h2 className="m-0 mb-4">Edit LTI Platform</h2>
      {formState?.status === 'failed' && (
        <Alert intent="danger">
          <span>{formState.message}</span>
        </Alert>
      )}

      <form
        action={formAction}
        onSubmit={handleSubmit(handleOnSubmit)}
        autoComplete="off"
        noValidate
      >
        <input type="hidden" {...register('id')} />
        <Input
          required
          id="name"
          label="Name"
          placeHolder="Name"
          helpText="Please enter a name"
          error={!isValid && hasErrors('name', errors, null)}
          errorText={!isValid ? getErrorText('name', errors, null) : ''}
          {...register('name')}
        />
        {/* Not registered with the form: the issuer can't be changed. */}
        <Input
          id="issuer"
          name="issuer"
          label="Issuer"
          defaultValue={platform.issuer}
          helpText="The issuer can't be changed. Register a new platform for a different issuer."
          readOnly={true}
        />
        <Input
          required
          id="client_id"
          label="Client ID"
          placeHolder="Client ID"
          helpText="Please enter the client ID"
          error={!isValid && hasErrors('client_id', errors, null)}
          errorText={!isValid ? getErrorText('client_id', errors, null) : ''}
          {...register('client_id')}
        />

        <EndpointFields register={(name) => register(name)} errors={errors} isValid={isValid}>
          {confirmingDefaults ? (
            <div
              role="group"
              aria-label="Confirm replacing endpoints"
              className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 p-2"
            >
              <span className="text-sm mr-auto">
                Replace all four endpoints with the adapter&apos;s defaults?
              </span>
              <Button type="button" size="sm" onClick={handleReplaceWithDefaults}>
                Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outlined"
                onClick={() => setConfirmingDefaults(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="mb-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outlined"
                onClick={() => {
                  setSuggestMessage(undefined)
                  setConfirmingDefaults(true)
                }}
                disabled={isSuggesting}
              >
                Fill defaults from issuer
              </Button>
              {suggestMessage != null && (
                <span role="alert" className="text-sm text-red-700 dark:text-red-500">
                  {suggestMessage}
                </span>
              )}
            </div>
          )}
        </EndpointFields>

        <div className="form-actions flex gap-2 justify-end my-4">
          <Button
            className="min-w-[120px]"
            intent="noeffect"
            render={<LangLink href={`/admin/lti-platforms/${platform.id}`} lng={lng} />}
          >
            Cancel
          </Button>
          <Button className="min-w-[120px]" disabled={isPending} type="submit">
            {isPending === true ? (
              <LoaderEllipsis color={theme === 'dark' ? '#000000' : '#FFFFFF'} size={42} />
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
