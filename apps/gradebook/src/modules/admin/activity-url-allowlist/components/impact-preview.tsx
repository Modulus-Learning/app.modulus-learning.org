'use client'

import { startTransition, useActionState } from 'react'

import { Button, LoaderEllipsis } from '@infonomic/uikit/react'

import { previewAllowlistImpact } from '../preview'
import { GrandfatheringNotice } from './copy'
import type { AllowlistImpactState } from '../@types'

/**
 * Counts, on request, how many existing activities the policy in force does
 * not admit.
 *
 * Behind an explicit action deliberately. The count reads every activity row
 * and matches each one in memory, so it must not become a cost paid on every
 * view of the rules list -- an administrator asks for it when the answer is
 * about to matter.
 */
export function ImpactPreview(): React.JSX.Element {
  const initialState: AllowlistImpactState = { status: 'idle' }
  const [state, formAction, isPending] = useActionState(previewAllowlistImpact, initialState)

  const handleOnClick = (): void => {
    startTransition(() => {
      formAction(new FormData())
    })
  }

  if (state.status === 'success' && state.impact != null) {
    return <GrandfatheringNotice impact={state.impact} />
  }

  return (
    <div className="mb-3">
      <Button type="button" intent="noeffect" disabled={isPending} onClick={handleOnClick}>
        {isPending ? (
          <LoaderEllipsis size={42} />
        ) : (
          'Count the activities this policy leaves grandfathered'
        )}
      </Button>
      {state.status === 'failed' && <p className="!mb-0 mt-2 text-sm">{state.message}</p>}
    </div>
  )
}
