'use client'

import { startTransition, useActionState, useState } from 'react'

import { Alert, Button } from '@infonomic/uikit/react'

import { deleteAllowlistRule } from '../delete'
import { GrandfatheringNotice } from './copy'
import { ImpactPreview } from './impact-preview'
import type { AllowlistRule, AllowlistRuleDeleteState } from '../@types'

/**
 * Deleting a rule, behind a confirmation that says what deletion does and does
 * not do. The distinction is the whole risk of this design: removing a rule is
 * not revocation.
 */
export function DeleteRuleForm({ rule }: { rule: AllowlistRule }): React.JSX.Element {
  const initialState: AllowlistRuleDeleteState = { message: undefined, status: 'idle' }
  const [formState, formAction, isPending] = useActionState(deleteAllowlistRule, initialState)
  const [confirming, setConfirming] = useState(false)

  const handleOnDelete = (): void => {
    const formData = new FormData()
    formData.append('id', rule.id)
    formData.append('base_url', rule.base_url)
    startTransition(() => {
      formAction(formData)
    })
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mt-2 mb-4">
      <h3 className="!mt-0 !mb-2">Delete this rule</h3>

      {formState?.status === 'failed' && (
        <Alert intent="danger">
          <span>{formState.message}</span>
        </Alert>
      )}

      {confirming ? (
        <>
          <GrandfatheringNotice />
          <ImpactPreview ruleId={rule.id} />
          <div className="flex gap-2">
            <Button type="button" intent="noeffect" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" intent="danger" disabled={isPending} onClick={handleOnDelete}>
              Delete rule
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" intent="danger" onClick={() => setConfirming(true)}>
          Delete rule
        </Button>
      )}
    </div>
  )
}
