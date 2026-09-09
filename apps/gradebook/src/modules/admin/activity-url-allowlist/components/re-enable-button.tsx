'use client'

import { startTransition, useActionState } from 'react'

import { Button } from '@infonomic/uikit/react'

import { editAllowlistRule } from '../edit'
import type { AllowlistRule, AllowlistRuleFormState } from '../@types'

/**
 * The explicit re-enable a `disabled_match` offers.
 *
 * It goes through the update command rather than a create, which is what keeps
 * the existing rule's description and original author. Re-enabling is never a
 * silent side effect of a create the administrator may not have realized was a
 * collision -- they confirm it here.
 */
export function ReEnableRuleButton({ rule }: { rule: AllowlistRule }): React.JSX.Element {
  const initialState: AllowlistRuleFormState = { message: undefined, errors: {}, status: 'idle' }
  const [formState, formAction, isPending] = useActionState(editAllowlistRule, initialState)

  const handleOnClick = (): void => {
    const formData = new FormData()
    formData.append('id', rule.id)
    formData.append('is_enabled', 'true')
    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <div className="mt-2">
      <Button type="button" disabled={isPending} onClick={handleOnClick}>
        Re-enable this rule
      </Button>
      {formState?.status === 'failed' && <p className="!mb-0 mt-2 text-sm">{formState.message}</p>}
    </div>
  )
}
