import { startTransition, useActionState, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { LangLink } from '@/framework'
import { useTheme } from '@/ui/theme/provider-base'
import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { ENDPOINT_FIELDS, ltiPlatformCreateSchema } from '../@types'
import { createLtiPlatform } from '../create'
import { generateCanvasConfig } from '../generate-canvas-config'
import { suggestLtiPlatformEndpoints } from '../suggest-endpoints'
import { EndpointFields } from './endpoint-fields'
import type { Locale } from '@/i18n/i18n-config'
import type { LtiPlatformFormState } from '../@types'

export function LtiPlatformCreateForm({ lng }: { lng: Locale }): React.JSX.Element {
  const { theme } = useTheme()
  const initialState: LtiPlatformFormState = {
    message: undefined,
    errors: {},
    status: 'idle',
  }
  const [formState, formAction, isPending] = useActionState(createLtiPlatform, initialState)
  const resolver = zodResolver(ltiPlatformCreateSchema)
  const {
    register,
    formState: { errors, isValid, isSubmitted },
    handleSubmit,
    setError,
    reset,
    getValues,
    setValue,
  } = useForm({ resolver, mode: 'onSubmit' })
  const [submitted, setSubmitted] = useState<boolean>(false)
  const [configStatus, setConfigStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [isGeneratingConfig, setIsGeneratingConfig] = useState<boolean>(false)
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false)
  const [suggestMessage, setSuggestMessage] = useState<string | undefined>(undefined)

  // Replaces all four endpoint fields with the adapter's defaults for the
  // issuer. A response is discarded if the issuer changed while it was in
  // flight, so endpoints never pair with a different issuer.
  const handleFillDefaults = async (): Promise<void> => {
    const issuer = getValues('issuer') ?? ''
    setIsSuggesting(true)
    setSuggestMessage(undefined)
    try {
      const result = await suggestLtiPlatformEndpoints(issuer)
      if ((getValues('issuer') ?? '') !== issuer) return
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

  const handleCopyCanvasConfig = async (): Promise<void> => {
    setIsGeneratingConfig(true)
    setConfigStatus('idle')
    try {
      const result = await generateCanvasConfig()
      if (result.ok && result.config != null) {
        await navigator.clipboard.writeText(result.config)
        setConfigStatus('copied')
      } else {
        setConfigStatus('failed')
      }
    } catch (error) {
      console.error('Error generating Canvas config:', error)
      setConfigStatus('failed')
    } finally {
      setIsGeneratingConfig(false)
    }
  }

  const handleOnSubmit = async (data: Record<string, any>): Promise<void> => {
    try {
      const formData = new FormData()
      for (const [key, value] of Object.entries(data)) {
        formData.append(key, value)
      }

      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  useEffect(() => {
    if (formState?.status === 'success' && submitted === false) {
      reset()
      setSubmitted(true)
      window.scrollTo(0, 100)
    }
  }, [formState?.status, submitted, reset])

  type ErrorKeys = keyof LtiPlatformFormState['errors']

  useEffect(() => {
    if (formState?.errors != null && Object.keys(formState.errors).length > 0) {
      const fields = Object.keys(formState.errors) as ErrorKeys[]
      for (const field of fields) {
        const errorMessage = getErrorText(field, null, formState.errors)
        setError(field, { message: errorMessage })
      }
    }
  }, [formState?.errors, setError])

  return (
    <div className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 p-5 pb-1 mb-8 mt-[4vh]">
      <h2 className="!m-0 !mb-4">Register New LTI Platform</h2>
      <div className="mb-3 prose">
        <p>To register Modulus with Canvas:</p>
        <ol>
          <li>Generate a JSON config and copy it to your clipboard using the button below.</li>
          <li>
            Add a new LTI developer key in Canvas, and paste the config under &quot;Method: Paste
            JSON&quot;.
          </li>
          <li>Find the client ID issued by Canvas.</li>
          <li>
            Fill in the form below with the platform name, the issuer, and the client ID issued by
            Canvas. For hosted Canvas the issuer is <code>https://canvas.instructure.com</code> (or{' '}
            <code>https://canvas.beta.instructure.com</code> or{' '}
            <code>https://canvas.test.instructure.com</code>), not your institution&apos;s Canvas
            URL. Then fill in the endpoints, or use &quot;Fill defaults from issuer&quot; and
            confirm each one.
          </li>
        </ol>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleCopyCanvasConfig}
          disabled={isGeneratingConfig}
        >
          {isGeneratingConfig ? (
            <LoaderEllipsis color={theme === 'dark' ? '#000000' : '#FFFFFF'} size={42} />
          ) : (
            'Copy Canvas Config JSON'
          )}
        </Button>
        {configStatus === 'copied' && (
          <span className="text-sm text-green-700 dark:text-green-500">Copied to clipboard.</span>
        )}
        {configStatus === 'failed' && (
          <span className="text-sm text-red-700 dark:text-red-500">Failed to generate config.</span>
        )}
      </div>
      {formState?.status === 'success' && (
        <Alert intent="success">
          <span>{formState.message}</span>
        </Alert>
      )}

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
        <Input
          required
          id="issuer"
          label="Issuer"
          placeHolder="Issuer"
          helpText="The platform's iss claim: an https URL with no trailing slash"
          error={!isValid && hasErrors('issuer', errors, null)}
          errorText={!isValid ? getErrorText('issuer', errors, null) : ''}
          {...register('issuer')}
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
          <div className="mb-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outlined"
              onClick={handleFillDefaults}
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
        </EndpointFields>

        <div className="form-actions flex gap-2 justify-end my-4">
          <Button
            className="min-w-[120px]"
            intent="noeffect"
            render={<LangLink href="/admin/lti-platforms" lng={lng} />}
          >
            {formState?.status === 'success' ? 'Close' : 'Cancel'}
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
