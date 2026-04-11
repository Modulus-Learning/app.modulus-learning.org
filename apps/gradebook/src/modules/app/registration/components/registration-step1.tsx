'use client'

import { type FormEvent, startTransition, useActionState, useEffect, useState } from 'react'

import { Alert, Button, Card, Checkbox, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useTranslations } from '@/i18n/client'
import { LangLink } from '@/i18n/components/lang-link'
import { Stepper } from '@/modules/app/registration/components/registration-stepper'
import { registrationStep1 } from '@/modules/app/registration/registration'
import { registrationStep1Schema } from '../@types'
import type { Locale } from '@/i18n/i18n-config'
import type { RegistrationStep1FormState } from '../@types'

const initialState: RegistrationStep1FormState = { errors: {}, status: 'idle' }

export function RegistrationStep1({
  lng,
  onSubmit,
  style = 'default',
  data,
}: {
  lng: Locale
  onSubmit: (nextStep: number, data: Record<string, any> | undefined) => void
  data?: Record<string, any>
  style: 'default' | 'compact'
}) {
  const { t } = useTranslations('register')
  const [formState, formAction, isPending] = useActionState(registrationStep1, initialState)
  const [errors, setErrors] = useState<Record<string, string>>()

  useEffect(() => {
    if (formState.status === 'success') {
      onSubmit(2, formState.data)
    }
  }, [formState.status, formState.data, onSubmit])

  const handleOnSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const data = Object.fromEntries(formData.entries())
    const parseResult = registrationStep1Schema.safeParse(data)
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
    // TODO: protect with reCaptcha
    // try {
    //   const formData = new FormData()
    //   Object.entries(data).forEach(([key, value]) => {
    //     formData.append(key, value)
    //   })
    //   if (process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED === 'true') {
    //     const token = await reCaptchaExecute('sign-in')
    //     if (token != null) {
    //       formData.append('token', token)
    //       formAction(formData)
    //     }
    //   } else {
    //     formAction(formData)
    //   }
    // } catch (error) {
    //   console.error('Error ocurred in handleOnSubmit:', error)
    // }
  }

  return (
    <Card className="sm:max-w-[400px] dark:border-gray-600">
      <Card.Header>
        <Card.Title className={cx('font-semibold', { 'text-[1.5rem]': style === 'compact' })}>
          {t('Sign Up')}
        </Card.Title>
        <Stepper step={1} />
        {formState.status === 'failed' && (
          <Alert intent="danger" className="">
            {formState.message}
          </Alert>
        )}
      </Card.Header>
      <Card.Content>
        <form action={formAction} onSubmit={handleOnSubmit} noValidate className="pt-2">
          <div className="form-elements flex flex-col gap-4 mt-0">
            <Input
              label={t('Name')}
              id="full_name"
              name="full_name"
              type="text"
              required
              placeHolder="Full Name"
              helpText="Please enter your full name."
              error={errors?.full_name != null || formState?.errors?.full_name != null}
              errorText={errors?.full_name ?? formState.errors.full_name?.[0] ?? ''}
            />
            <Input
              label={t('Email')}
              id="email"
              name="email"
              type="email"
              placeHolder="Email"
              required
              helpText="Please enter your email address."
              error={errors?.email != null || formState?.errors?.email != null}
              errorText={errors?.email ?? formState.errors.email?.[0] ?? ''}
            />

            <div className="flex flex-col items-end sm:flex-row sm:items-start justify-between mt-3">
              <div>
                <Checkbox
                  label={t('Agree to terms of use')}
                  id="agree_to_terms"
                  name="agree_to_terms"
                  helpText="Please take a moment to read and agree to our terms of use."
                  error={
                    errors?.agree_to_terms != null || formState?.errors?.agree_to_terms != null
                  }
                  errorText={errors?.agree_to_terms ?? formState.errors.agree_to_terms?.[0] ?? ''}
                />
              </div>
              <LangLink
                lng={lng}
                className="whitespace-nowrap text-sm font-medium underline mt-1"
                href="/"
              >
                {t('Terms of Use')}
              </LangLink>
            </div>
            <div className="actions flex items-center flex-row justify-end">
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
            {style === 'default' && (
              <p className="text-sm">
                <span className="text-muted-foreground">{t('Already have an account?')}</span>{' '}
                <LangLink href="/sign-in" className="font-medium underline">
                  {t('Sign In')}
                </LangLink>
              </p>
            )}
          </div>
        </form>
      </Card.Content>
    </Card>
  )
}
