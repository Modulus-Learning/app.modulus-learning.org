/**
 * Consumer type test for packaged route factories, compiled by this app's
 * `typecheck` against the host package's built declarations. A factory's route
 * must keep its literal path and its params, context, search and loader-data
 * types, so the host's generated route tree can infer them. Nothing here runs.
 */
import type { UsersResponse } from '@modulus-learning/host-tanstack-start/modules/admin/users/@types/index'

import type { Route as ActivityRoute } from '../routes/$lng/_admin/admin/_authed/activities/$id/edit'
import type { Route as UsersRoute } from '../routes/$lng/_admin/admin/_authed/users/index'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
// Mutual assignability, for types TanStack wraps in structurally equal aliases.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const assert = <T extends true>(): T => true as T

type Users = (typeof UsersRoute)['types']
type Activity = (typeof ActivityRoute)['types']

// The literal path survives the factory.
assert<Equal<Users['fullPath'], '/$lng/admin/users/'>>()
assert<Equal<Activity['fullPath'], '/$lng/admin/activities/$id/edit'>>()

// Params: `lng` keeps the locale layout's parsed type; `$id` comes from the path.
assert<Equal<Users['allParams']['lng'], 'es' | 'en'>>()
assert<Equal<Activity['allParams']['id'], string>>()
// @ts-expect-error the users list has no `id` param
export type NoIdParam = Users['allParams']['id']

// Context accumulates through the packaged layouts' `beforeLoad`s.
assert<Equal<Users['allContext']['locale'], 'es' | 'en'>>()
assert<Equal<Users['allContext']['adminSession']['provider'], 'admin_session'>>()
// @ts-expect-error the admin area has no learner session in context
export type NoLearnerSession = Users['allContext']['session']

// Search keeps the packaged validator's output type.
assert<Same<Users['searchSchema'], Record<string, string>>>()
// @ts-expect-error the users search schema is not a page-number object
assert<Same<Users['searchSchema'], { page: number }>>()

// Loader data keeps the packaged loader's return type.
assert<Same<Users['loaderData']['data'], UsersResponse>>()
// @ts-expect-error the loader returns no `admins` field
export type NoAdmins = Users['loaderData']['admins']
