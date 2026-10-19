import { Registry } from '@/lib/registry.js'
import { ActivityUrlAllowlistMutations, ActivityUrlAllowlistQueries } from './repository/index.js'
import { ActivityRegistrationService } from './services/activity-registration.js'
import { AllowlistPolicyService } from './services/allowlist-policy.js'

/**
 * The activity-admission module: the allowlist rules, the policy, and the one
 * writer of `activities` rows.
 *
 * It is composed at the root, before `app`, `admin` and `agent`, because all
 * three actor domains reach it. It is deliberately **not** projected into
 * `CoreCommands` — it is internal domain logic, not an actor-facing command
 * surface. The admin allowlist commands are the only public door to any of it.
 */
export const createActivityRegistrationRegistry = () =>
  new Registry()
    .addClass('queries', ActivityUrlAllowlistQueries)
    .addClass('mutations', ActivityUrlAllowlistMutations)
    .addClass('policy', AllowlistPolicyService)
    .addClass('service', ActivityRegistrationService)
