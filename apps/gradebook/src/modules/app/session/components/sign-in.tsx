'use client'

import type React from 'react'
import type { FormEvent } from 'react'
import { startTransition, useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  Alert,
  Button,
  Card,
  Checkbox,
  GithubIcon,
  GoogleIcon,
  Input,
  LoaderEllipsis,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { useTranslations } from '@/i18n/client'
import { LangLink } from '@/i18n/components/lang-link'
import { startGithubOAuthFlow } from '@/modules/app/session/oauth-github'
import { startGoogleOAuthFlow } from '@/modules/app/session/oauth-google'
import { signIn } from '@/modules/app/session/password-auth'
import { signInSchema } from '../@types'
import type { Locale } from '@/i18n/i18n-config'
import type { GitHubFormState, GoogleFormState, SignInFormState } from '../@types'

const signInInitialState: SignInFormState = { errors: {}, status: 'idle' }
const gitHubInitialState: GitHubFormState = { status: 'idle' }
const googleInitialState: GoogleFormState = { status: 'idle' }

export function SignIn({
  lng,
  style = 'default',
  source,
  callBackUrl,
}: {
  lng: Locale
  style: 'default' | 'compact'
  source: string
  callBackUrl: string
}): React.JSX.Element {
  const { t } = useTranslations('auth')
  const searchParams = useSearchParams()
  const callback = searchParams.get('callbackUrl') ?? callBackUrl
  const oauthError = searchParams.get('error')
  const [signInFormState, signInFormAction, signInIsPending] = useActionState(
    signIn,
    signInInitialState
  )
  const [_gitHubFormState, gitHubFormAction, gitHubIsPending] = useActionState(
    startGithubOAuthFlow,
    gitHubInitialState
  )

  const [_googleFormState, googleFormAction, googleIsPending] = useActionState(
    startGoogleOAuthFlow,
    googleInitialState
  )

  const [errors, setErrors] = useState<Record<string, string>>()

  const handleOnSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const data = Object.fromEntries(formData.entries())
    const parseResult = signInSchema.safeParse(data)
    if (parseResult.success === true) {
      setErrors(undefined)
      startTransition(() => {
        signInFormAction(formData)
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
    //   console.error('Error occurred in handleOnSubmit:', error)
    // }
  }

  return (
    <Card className="sm:max-w-[400px] dark:border-gray-600">
      <Card.Header className="pb-1">
        <Card.Title className={cx('font-semibold', { 'text-[1.5rem]': style === 'compact' })}>
          {t('Sign In')}
        </Card.Title>
        <Card.Description>
          Sign in to your account. {t('Don’t have an account yet?')}{' '}
          <LangLink
            href="/sign-up"
            className="font-medium text-primary-600 underline dark:text-white"
          >
            {t('Sign Up')}
          </LangLink>
        </Card.Description>
        {oauthError != null && (
          <Alert intent="danger" className="mb-0">
            An error occurred while attempting authentication.
          </Alert>
        )}
        {signInFormState.status === 'failed' && (
          <>
            <Alert intent="danger" className="mb-0">
              {signInFormState.message}
            </Alert>
            {signInFormState?.errors?.email != null &&
              signInFormState?.errors?.email.length > 0 && (
                <p>{signInFormState?.errors?.email?.join(',')} </p>
              )}

            {signInFormState?.errors?.password != null &&
              signInFormState?.errors?.password.length > 0 && (
                <p>{signInFormState?.errors?.password?.join(',')} </p>
              )}

            {signInFormState?.errors?.remember_me != null &&
              signInFormState?.errors?.remember_me.length > 0 && (
                <p>{signInFormState?.errors?.remember_me?.join(',')} </p>
              )}
          </>
        )}
      </Card.Header>

      <Card.Content>
        <form action={signInFormAction} onSubmit={handleOnSubmit} noValidate className="pt-2 mb-2">
          <input type="hidden" name="callback_url" value={callback} />
          <div className="form-elements flex flex-col gap-4 mt-0">
            <div>
              <Input
                label={t('Email')}
                id="email"
                name="email"
                type="email"
                required
                error={errors?.email != null || signInFormState?.errors?.email != null}
                errorText={errors?.email ?? signInFormState.errors.email?.[0] ?? ''}
              />
            </div>
            <div>
              <Input
                label={t('Password')}
                id="password"
                name="password"
                type="password"
                required
                error={errors?.password != null || signInFormState?.errors?.password != null}
                errorText={errors?.password ?? signInFormState.errors.password?.[0] ?? ''}
              />
            </div>
            <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between mb-0 ml-[2px]">
              <div className="flex items-start">
                <Checkbox label={t('Remember me')} id="remember_me" name="remember_me" />
              </div>
              <LangLink
                lng={lng}
                href="/"
                className="text-sm font-medium text-primary-600 hover:underline dark:text-white"
              >
                {t('Forgot password?')}
              </LangLink>
            </div>
            <Button
              type="submit"
              className="min-h-[42px]"
              size="md"
              aria-disabled={signInIsPending}
              disabled={signInIsPending}
            >
              {signInIsPending === true ? (
                <LoaderEllipsis size={30} color="#AAAAAA" />
              ) : (
                <span>{t('Sign In')}</span>
              )}
            </Button>
          </div>
        </form>
      </Card.Content>
      <Card.Footer className="flex flex-col">
        <div className="relative w-full mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="background px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 w-full mb-4">
          <form action={gitHubFormAction}>
            <input type="hidden" name="source" value={source} />
            {callback != null && <input type="hidden" name="callbackUrl" value={callback} />}
            <Button
              variant="outlined"
              type="submit"
              disabled={gitHubIsPending}
              aria-disabled={signInIsPending}
              className="w-full"
            >
              <GithubIcon />
              {gitHubIsPending === true ? (
                <LoaderEllipsis size={30} color="#AAAAAA" />
              ) : (
                <span>Github</span>
              )}
            </Button>
          </form>
          <form action={googleFormAction}>
            <input type="hidden" name="source" value={source} />
            {callback != null && <input type="hidden" name="callbackUrl" value={callback} />}
            <Button
              variant="outlined"
              type="submit"
              aria-disabled={signInIsPending}
              disabled={googleIsPending}
              className="w-full"
            >
              <GoogleIcon />
              {googleIsPending === true ? (
                <LoaderEllipsis size={30} color="#AAAAAA" />
              ) : (
                <span>Google</span>
              )}
            </Button>
          </form>
        </div>
      </Card.Footer>
    </Card>
  )
}
