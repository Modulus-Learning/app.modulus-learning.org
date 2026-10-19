import { Alert } from '@infonomic/uikit/react'

import type { AllowlistImpact, AllowlistRule } from '../@types'

/**
 * The required copy for the allowlist surface, in one place.
 *
 * This wording is a contract, not a design preference. The whole risk of this
 * design is an administrator mistaking rule removal for revocation, so these
 * sentences are the mitigation for that risk and are covered by tests.
 *
 * Never describe an activity outside the policy as blocked, disabled, invalid
 * or noncompliant. It is **grandfathered**: it keeps working, and it may still
 * be added to activity codes and used in new deep links.
 */
export const ALLOWLIST_COPY = {
  emptyStateHeading: 'No allowlist rules exist, so all valid activity URLs can be registered.',
  allDisabledHeading:
    'All allowlist rules are disabled, so all valid activity URLs can be registered.',
  emptyStateBody:
    'Add an enabled rule to restrict new registrations to matching URLs. If all rules are disabled, all valid activity URLs can be registered again.',
  changeWarning:
    'With enabled rules remaining, new URLs must match one of them. Disabling or deleting the last enabled rule allows all valid activity URLs. Existing activities will continue to work and may still be added to activity codes or used in new deep links.',
  grandfatheredLabel: 'grandfathered',
} as const

/** Shown whenever the policy has no enabled rules. */
export function AllowAllEmptyState({
  allDisabled = false,
}: {
  allDisabled?: boolean
}): React.JSX.Element {
  return (
    <Alert intent="info" className="mt-4 max-w-[70ch]">
      <div>
        <p className="!mt-0 !mb-1 font-semibold">
          {allDisabled ? ALLOWLIST_COPY.allDisabledHeading : ALLOWLIST_COPY.emptyStateHeading}
        </p>
        <p className="!my-0">{ALLOWLIST_COPY.emptyStateBody}</p>
      </div>
    </Alert>
  )
}

/**
 * Shown before disabling or deleting a rule, and beside a prospective policy.
 *
 * The count is the number of existing activities the policy would not admit
 * today. They are unaffected by the change, which is the point of showing it.
 */
export function GrandfatheringNotice({ impact }: { impact?: AllowlistImpact }): React.JSX.Element {
  return (
    <div className="mt-3 mb-3 rounded-md border border-gray-100 dark:border-gray-700 p-3">
      <p className="!mt-0 !mb-2">{ALLOWLIST_COPY.changeWarning}</p>
      {impact != null && (
        <p className="!my-0 text-sm">
          {impact.grandfathered_count} of {impact.total_activities} existing{' '}
          {impact.total_activities === 1 ? 'activity is' : 'activities are'}{' '}
          {ALLOWLIST_COPY.grandfatheredLabel} under the proposed policy. They keep working.
        </p>
      )}
    </div>
  )
}

/**
 * Shown when a submitted base URL normalized onto a rule that already exists.
 *
 * Informational, never an error: nothing was written, and the administrator
 * asked for a state that already holds — or holds in a disabled form they can
 * re-enable, which keeps the existing rule's description and provenance.
 */
export function CollisionNotice({
  status,
  existing,
  action,
}: {
  status: 'already_enabled' | 'disabled_match'
  existing: AllowlistRule
  /** The re-enable control, rendered only for a disabled match. */
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <Alert intent="info">
      <div>
        {status === 'already_enabled' ? (
          <p className="!mt-0 !mb-1">
            A rule for <span className="font-mono">{existing.base_url}</span> already exists and is
            enabled. Nothing was changed.
          </p>
        ) : (
          <p className="!mt-0 !mb-1">
            A rule for <span className="font-mono">{existing.base_url}</span> already exists but is
            currently disabled. Nothing was changed. You can re-enable it, which keeps its
            description and its original author.
          </p>
        )}
        {existing.description != null && existing.description !== '' && (
          <p className="!my-1 text-sm">Description: {existing.description}</p>
        )}
        {action}
      </div>
    </Alert>
  )
}
