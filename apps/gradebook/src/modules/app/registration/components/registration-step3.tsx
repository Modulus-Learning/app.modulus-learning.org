'use client'

import { type FormEvent, startTransition, useActionState, useEffect, useRef, useState } from 'react'

import { Alert, Button, Card, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useTranslations } from '@/i18n/client'
import { LangLink } from '@/i18n/components/lang-link'
import { Stepper } from '@/modules/app/registration/components/registration-stepper'
import { registrationStep3 } from '@/modules/app/registration/registration'
import { registrationStep3Schema } from '../@types'
import type { Locale } from '@/i18n/i18n-config'
import type { RegistrationStep3FormState } from '../@types'

const initialState: RegistrationStep3FormState = { errors: {}, status: 'idle' }

export function RegistrationStep3({
  lng,
  onSubmit,
  style = 'default',
  data: dataFromProps,
  callbackUrl,
}: {
  lng: Locale
  onSubmit: (nextStep: number, data: Record<string, any> | undefined) => void
  data?: Record<string, any>
  callbackUrl?: string
  style: 'default' | 'compact'
}) {
  const { t } = useTranslations('register')
  const formRef = useRef<HTMLFormElement>(null)
  const [formState, formAction, isPending] = useActionState(registrationStep3, initialState)
  const [errors, setErrors] = useState<Record<string, string>>()

  useEffect(() => {
    if (formState.status === 'success') {
      onSubmit(3, formState.data)
      if (formRef?.current != null) {
        formRef.current.reset()
      }
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
    const parseResult = registrationStep3Schema.safeParse(data)
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
        <Stepper step={3} complete={formState.status === 'success'} />
        {formState.status === 'failed' && (
          <Alert intent="danger" className="mt-2">
            {formState.message}
          </Alert>
        )}
        {formState.status === 'success' && (
          <Alert intent="success">
            <span>
              w00t! You&apos;re now registered. Visit the{' '}
              <LangLink href="/sign-in" lng={lng} className="underline">
                Sign In
              </LangLink>{' '}
              page to sign in.
            </span>
          </Alert>
        )}
      </Card.Header>
      <Card.Content>
        <form
          ref={formRef}
          action={formAction}
          onSubmit={handleOnSubmit}
          noValidate
          className="pt-2"
        >
          <input type="hidden" id="callback_url" name="callback_url" value={callbackUrl} />
          <div className="form-elements flex flex-col gap-2 mt-0">
            <div>
              <Input
                label={t('Password')}
                id="password"
                name="password"
                type="password"
                required
                helpText="Please choose a password. Passwords must be at least 8 characters long and include one uppercase letter, one number, and one special character."
                error={errors?.password != null || formState?.errors?.password != null}
                errorText={errors?.password ?? formState.errors.password?.[0] ?? ''}
              />
            </div>
            <div>
              <Input
                label={t('Confirm Password')}
                id="confirm_password"
                name="confirm_password"
                type="password"
                required
                error={
                  errors?.confirm_password != null || formState?.errors?.confirm_password != null
                }
                errorText={errors?.confirm_password ?? formState.errors.confirm_password?.[0] ?? ''}
              />
            </div>
            <div className="actions flex items-center flex-row justify-between mt-4">
              <div>&nbsp;</div>
              {formState.status !== 'success' && (
                <Button
                  type="submit"
                  disabled={isPending}
                  aria-disabled={isPending}
                  className="min-w-[130px]"
                >
                  {isPending === true ? (
                    <LoaderEllipsis size={30} color="#aaaaaa" />
                  ) : (
                    <span>{t('Submit')}</span>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Card.Content>
    </Card>
  )
}
