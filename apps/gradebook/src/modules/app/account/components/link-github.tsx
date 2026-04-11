'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Button, GithubIcon, LoaderEllipsis } from '@infonomic/uikit/react'

import { startGithubOAuthFlow } from '@/modules/app/session/oauth-github'
import type { Locale } from '@/i18n/i18n-config'
import type { GitHubFormState } from '@/modules/app/session/@types'
import type { User } from '../@types'

const gitHubInitialState: GitHubFormState = { status: 'idle' }

export const LinkGithub = ({ user, lng }: { user: User; lng: Locale }) => {
  const searchParams = useSearchParams()
  const [_, gitHubFormAction, gitHubIsPending] = useActionState(
    startGithubOAuthFlow,
    gitHubInitialState
  )

  let errorMessage: string | null = null
  const error = searchParams.get('source') === 'github' ? searchParams.get('error') : null
  if (error != null) {
    if (error === 'other_linked_account') {
      errorMessage =
        'Your GitHub account is already linked to another account. Modulus does not currently support merging accounts, and so you will need to unlink the other account before linking to this one.'
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
          <GithubIcon width="24px" height="24px" />
          Github
        </span>
        <span>
          {user.github_id != null ? (
            <Button className="min-w-[60px]" size="sm" intent="danger">
              Unlink
            </Button>
          ) : (
            <form action={gitHubFormAction}>
              <input type="hidden" id="source" name="source" value="/account" />
              <input type="hidden" id="callbackUrl" name="callbackUrl" value="/account" />
              <Button
                className="min-w-[60px]"
                size="sm"
                type="submit"
                disabled={gitHubIsPending}
                aria-disabled={gitHubIsPending}
              >
                {gitHubIsPending === true ? (
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
