'use client'

import { type FormEvent, startTransition, useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Alert, Button, Card, Checkbox, Input, LoaderEllipsis } from '@infonomic/uikit/react'

import { useTranslations } from '@/i18n/client'
import { LangLink } from '@/i18n/components/lang-link'
import { signIn } from '@/modules/admin/session/password-auth'
import { signInSchema } from '../@types'
import type { Locale } from '@/i18n/i18n-config'
import type { SignInFormState } from '../@types'

const initialState: SignInFormState = { errors: {}, status: 'idle' }

export function SignInForm({ lng }: { lng: Locale }) {
  const { t } = useTranslations('auth')
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl')
  const [formState, formAction, isPending] = useActionState(signIn, initialState)
  const [errors, setErrors] = useState<Record<string, string>>()

  const handleOnSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const data = Object.fromEntries(formData.entries())
    const parseResult = signInSchema.safeParse(data)
    if (parseResult.success === true) {
      setErrors(undefined)
      startTransition(() => {
        formAction(formData)
      })
    } else {
      console.log('Zod validation error:', parseResult.error)
      const errors: Record<string, string> = {}
      for (const issue of parseResult.error.issues) {
        console.log(issue.code, issue.path.join(','), issue.message)
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
    <Card className="sm:max-w-[380px]">
      <Card.Header>
        <Card.Title>
          <h2>{t('Sign In')}</h2>
        </Card.Title>
        <Card.Description>Sign in to your account.</Card.Description>
        {formState.status === 'failed' && (
          <Alert intent="danger" className="">
            {formState.message}
          </Alert>
        )}
      </Card.Header>

      <Card.Content>
        <form action={formAction} onSubmit={handleOnSubmit} noValidate className="pt-2 mb-2">
          {callbackUrl != null && callbackUrl.length > 0 && (
            <Input type="hidden" id="callbackUrl" name="callbackUrl" value={callbackUrl} />
          )}
          <div className="form-elements flex flex-col gap-4 mt-0">
            <div>
              <Input
                label={t('Email')}
                id="email"
                name="email"
                type="email"
                required
                placeHolder="Enter your email address"
                error={errors?.email != null || formState?.errors?.email != null}
                errorText={errors?.email ?? formState.errors.email?.[0] ?? ''}
              />
            </div>
            <div>
              <Input
                label={t('Password')}
                id="password"
                name="password"
                type="password"
                required
                placeHolder="Enter your password"
                error={errors?.password != null || formState?.errors?.password != null}
                errorText={errors?.password ?? formState.errors.password?.[0] ?? ''}
              />
            </div>
            <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between mb-0 ml-[2px]">
              <div className="flex items-start">
                <Checkbox label={t('Remember me')} id="remember_me" name="remember_me" />
              </div>
              <LangLink
                href="/"
                lng={lng}
                className="text-sm font-medium text-primary-600 hover:underline dark:text-white"
              >
                {t('Forgot password?')}
              </LangLink>
            </div>
            <div className="actions mt-3 mb-4">
              <Button type="submit" fullWidth aria-disabled={isPending}>
                {isPending === true ? (
                  <LoaderEllipsis size={30} color="#aaaaaa" />
                ) : (
                  <span>{t('Sign In')}</span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Card.Content>
      {/* <CardFooter className="flex flex-col">
      <div className="relative w-full mb-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>
      <div className="flex flex-col gap-4 w-full mb-4">
        <Button variant="outlined">
          <GithubIcon />
          GitHub
        </Button>
        <Button variant="outlined">
          <GoogleIcon />
          Google
        </Button>
      </div>
    </CardFooter> */}
    </Card>
  )
}
