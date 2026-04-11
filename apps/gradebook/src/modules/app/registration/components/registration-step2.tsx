'use client'

import { type FormEvent, startTransition, useActionState, useEffect, useState } from 'react'

import { Alert, Button, Card, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useTranslations } from '@/i18n/client'
import { Stepper } from '@/modules/app/registration/components/registration-stepper'
import { registrationStep2 } from '@/modules/app/registration/registration'
import { registrationStep2Schema } from '../@types'
import type { Locale } from '@/i18n/i18n-config'
import type { RegistrationStep2FormState } from '../@types'

const initialState: RegistrationStep2FormState = { errors: {}, status: 'idle' }

export function RegistrationStep2({
  lng,
  onSubmit,
  style = 'default',
  data: dataFromProps,
}: {
  lng: Locale
  onSubmit: (nextStep: number, data: Record<string, any> | undefined) => void
  data?: Record<string, any>
  style: 'default' | 'compact'
}) {
  const { t } = useTranslations('register')
  const [formState, formAction, isPending] = useActionState(registrationStep2, initialState)
  const [errors, setErrors] = useState<Record<string, string>>()

  useEffect(() => {
    if (formState.status === 'success') {
      onSubmit(3, formState?.data)
    }
  }, [formState.status, formState.data, onSubmit])

  const handleOnSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    // Add the pre-registration record ID
    if (dataFromProps != null) {
      formData.set('id', dataFromProps.id)
    }
    const data = Object.fromEntries(formData.entries())
    const parseResult = registrationStep2Schema.safeParse(data)
    if (parseResult.success === true) {
      setErrors(undefined)
      startTransition(() => {
        formAction(formData)
      })
    } else {
      const errors: Record<string, string> = {}
      for (const issue of parseResult.error.issues) {
        // console.log(issue.code, issue.path.join(','), issue.message)
        // Will overwrite the previous error for the same key, which
        // is fine since this is a simple error handling scenario.
        // Previous errors will shown on each attempted submit
        errors[issue.path.join(', ')] = issue.message
      }
      setErrors(errors)
    }
  }

  return (
    <Card className="sm:max-w-[400px] dark:border-gray-600">
      <Card.Header>
        <Card.Title className={cx('font-semibold', { 'text-[1.5rem]': style === 'compact' })}>
          {t('Sign Up')}
        </Card.Title>
        <Stepper step={2} />
        {formState.status === 'failed' && (
          <Alert intent="danger" className="">
            {formState.message}
          </Alert>
        )}
      </Card.Header>
      <Card.Content>
        <form action={formAction} onSubmit={handleOnSubmit} noValidate className="pt-2">
          <div className="form-elements flex flex-col gap-4 mt-0">
            <div>
              <Input
                label={t('Verification Code')}
                id="verification_code"
                name="verification_code"
                type="text"
                required
                helpText="Please enter the email verification code we sent to your email address."
                error={
                  errors?.verification_code != null || formState?.errors?.verification_code != null
                }
                errorText={
                  errors?.verification_code ?? formState.errors.verification_code?.[0] ?? ''
                }
              />
            </div>
            <div className="actions flex items-center flex-row justify-between">
              <div>&nbsp;</div>
              <Button
                type="submit"
                disabled={isPending}
                aria-disabled={isPending}
                className="min-w-[130px]"
              >
                {isPending === true ? (
                  <LoaderEllipsis size={30} color="#aaaaaa" />
                ) : (
                  <span>{t('Next Step')}&nbsp;&rarr;</span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Card.Content>
    </Card>
  )
}
