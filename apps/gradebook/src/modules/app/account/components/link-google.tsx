'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Button, GoogleIcon, LoaderEllipsis } from '@infonomic/uikit/react'

import { startGoogleOAuthFlow, unlinkGoogleAccount } from '@/modules/app/session/oauth-google'
import type { Locale } from '@/i18n/i18n-config'
import type { GoogleFormState } from '@/modules/app/session/@types'
import type { User } from '../@types'

const googleInitialState: GoogleFormState = { status: 'idle' }

export const LinkGoogle = ({ user, lng }: { user: User; lng: Locale }) => {
  const searchParams = useSearchParams()
  const [_googleState, googleFormAction, googleIsPending] = useActionState(
    startGoogleOAuthFlow,
    googleInitialState
  )

  const [_unlinkState, unlinkFormAction, unlinkIsPending] = useActionState(
    unlinkGoogleAccount,
    googleInitialState
  )

  let errorMessage: string | null = null
  const error = searchParams.get('source') === 'google' ? searchParams.get('error') : null
  if (error != null) {
    if (error === 'other_linked_account') {
      errorMessage =
        'Your Google account is already linked to another account. Modulus does not currently support merging accounts, and so you will need to unlink the other account before linking to this one.'
    } else if (error === 'not_found') {
      errorMessage = 'An error occurred. Invalid user.'
    } else {
      errorMessage = 'An error occurred.'
    }
  }

  return (
    <div className="flex flex-col p-2 rounded-md border border-gray-100 dark:border-gray-700 gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <GoogleIcon width="24px" height="24px" />
          Google
        </span>
        <span>
          {user.google_id != null ? (
            <form action={unlinkFormAction}>
              <Button
                className="min-w-[60px]"
                size="sm"
                intent="danger"
                type="submit"
                disabled={unlinkIsPending}
                aria-disabled={unlinkIsPending}
              >
                {unlinkIsPending === true ? (
                  <LoaderEllipsis size={30} color="#AAAAAA" />
                ) : (
                  <span>Unlink</span>
                )}
              </Button>
            </form>
          ) : (
            <form action={googleFormAction}>
              <input type="hidden" id="source" name="source" value="/account" />
              <input type="hidden" id="callbackUrl" name="callbackUrl" value="/account" />
              <Button
                className="min-w-[60px]"
                size="sm"
                type="submit"
                disabled={googleIsPending}
                aria-disabled={googleIsPending}
              >
                {googleIsPending === true ? (
                  <LoaderEllipsis size={30} color="#AAAAAA" />
                ) : (
                  <span>Link</span>
                )}
              </Button>
            </form>
          )}
        </span>
      </div>
      {errorMessage != null && <div className="text-sm text-red-500">{errorMessage}</div>}
    </div>
  )
}
