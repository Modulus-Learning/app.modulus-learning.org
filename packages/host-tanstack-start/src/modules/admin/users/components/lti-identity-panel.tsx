import { startTransition, useActionState, useEffect, useState } from 'react'

import { Alert, Button } from '@infonomic/uikit/react'

import { useRouter } from '@/framework'
import { encodeExpectedLtiIdentity, type LtiIdentity, type UnlinkLtiState } from '../@types'
import { unlinkUserLtiIdentity } from '../unlink-lti'

export interface LtiIdentityPanelProps {
  userId: string
  vid: number
  lti: LtiIdentity | null
  /** Whether the signed-in admin holds `users:edit`; core enforces it regardless. */
  canUnlink: boolean
}

/**
 * The confirm step's state belongs to one user, version and identity. Render
 * the panel with this key so a change of any of them, including the new `vid`
 * after a successful unlink, remounts it and drops a pending confirmation.
 */
export const ltiIdentityPanelKey = ({
  userId,
  vid,
  lti,
}: Omit<LtiIdentityPanelProps, 'canUnlink'>) =>
  // A JSON tuple, so values containing separators cannot collide and null
  // stays distinct from the empty string.
  JSON.stringify([userId, vid, lti?.issuer ?? null, lti?.subject ?? null])

const initialState: UnlinkLtiState = { status: 'idle' }

/**
 * Shows a learner's LTI identity and, for an admin with `users:edit`, lets
 * them unlink it. Unlinking is support recovery for a learner refused with
 * "Account Already Linked"; the confirmation states what it does not do.
 */
export function LtiIdentityPanel({ userId, vid, lti, canUnlink }: LtiIdentityPanelProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, isPending] = useActionState(unlinkUserLtiIdentity, initialState)

  useEffect(() => {
    if (state.status === 'success') {
      // The reloaded user has a new vid and no identity, so the panel's key
      // changes and it remounts with no confirmation pending.
      router.refresh()
    }
  }, [state, router])

  const handleConfirm = () => {
    const formData = new FormData()
    formData.append('id', userId)
    formData.append('vid', String(vid))
    formData.append(
      'expected',
      encodeExpectedLtiIdentity({ issuer: lti?.issuer ?? null, subject: lti?.subject ?? null })
    )
    startTransition(() => formAction(formData))
  }

  return (
    <section
      aria-labelledby="lti-identity-heading"
      className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 px-5 py-3 mb-8"
    >
      <h2 id="lti-identity-heading" className="!mt-0">
        LTI identity
      </h2>

      {lti == null && <p data-testid="lti-state">Not linked.</p>}

      {lti != null && (
        <>
          <p data-testid="lti-state">
            {lti.linked ? 'Linked.' : 'Not linked (incomplete LTI identity data).'}
          </p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="font-bold">Issuer</dt>
            <dd style={{ overflowWrap: 'anywhere' }}>{lti.issuer ?? '-'}</dd>
            <dt className="font-bold">Subject</dt>
            <dd style={{ overflowWrap: 'anywhere' }}>{lti.subject ?? '-'}</dd>
          </dl>
        </>
      )}

      {state.message != null && state.status !== 'success' && (
        <Alert intent={state.status === 'conflict' ? 'warning' : 'danger'} className="mt-3">
          {state.message}
        </Alert>
      )}

      {lti != null && canUnlink && !confirming && (
        <div className="flex justify-end mt-3">
          <Button intent="danger" variant="outlined" onClick={() => setConfirming(true)}>
            Unlink
          </Button>
        </div>
      )}

      {lti != null && canUnlink && confirming && (
        <div className="mt-3" data-testid="lti-confirm">
          <p className="text-sm">
            Unlinking clears this LTI identity. The account, its email and its progress are kept.
          </p>
          <ul className="text-sm list-disc pl-5">
            <li>
              The next launch whose email matches this account links its identity to it, whichever
              launch arrives first. That may be the previous identity.
            </li>
            <li>It does not sign anyone out: existing sessions keep working.</li>
            <li>
              It does not block the previous identity. To keep someone out, disable the account
              instead.
            </li>
          </ul>
          <div className="flex gap-2 justify-end">
            <Button intent="noeffect" onClick={() => setConfirming(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button intent="danger" onClick={handleConfirm} disabled={isPending}>
              Confirm unlink
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
