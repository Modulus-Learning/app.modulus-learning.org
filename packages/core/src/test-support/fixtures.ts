import { v7 as uuidv7 } from 'uuid'

import {
  activities,
  DEFAULT_SCOPE_ID,
  lineitems,
  platformDeployments,
  platforms,
  progress,
  progressEvents,
  scopes,
  users,
} from '@/database/schema/index.js'
import type { DB } from '@/database/index.js'

type LineItemRecord = typeof lineitems.$inferSelect

/** A platform + one deployment + one user + one activity -- the FK backdrop a
 * line item needs. Returns the identifiers the repositories key on. */
export type Scenario = {
  platformId: string
  issuer: string
  deploymentId: string
  userId: string
  activityId: string
  activityUrl: string
}

export async function seedScenario(
  db: DB,
  overrides: { issuer?: string; deploymentId?: string } = {}
): Promise<Scenario> {
  const issuer = overrides.issuer ?? `https://canvas.test/${uuidv7()}`
  const deploymentId = overrides.deploymentId ?? 'deployment-1'
  const platformId = uuidv7()
  const userId = uuidv7()
  const activityId = uuidv7()
  const activityUrl = `https://content.test/${uuidv7()}`

  await db.insert(platforms).values({
    id: platformId,
    issuer,
    name: 'Test Platform',
    client_id: 'client-1',
    authorization_endpoint: 'https://canvas.test/auth',
    token_endpoint: 'https://canvas.test/token',
    jwks_uri: 'https://canvas.test/jwks',
    authorization_server: 'https://canvas.test',
  })
  await db
    .insert(platformDeployments)
    .values({ platform_issuer: issuer, deployment_id: deploymentId })
  await db.insert(users).values({ id: userId })
  await db.insert(activities).values({ id: activityId, url: activityUrl })

  return { platformId, issuer, deploymentId, userId, activityId, activityUrl }
}

/** Inserts a non-default scope for a platform and returns its id. */
export async function seedScope(
  db: DB,
  platformId: string,
  externalId = `term-${uuidv7()}`
): Promise<string> {
  const id = uuidv7()
  await db.insert(scopes).values({ id, platform_id: platformId, external_id: externalId })
  return id
}

/** Inserts a fresh user and returns its id. */
export async function seedUser(db: DB): Promise<string> {
  const id = uuidv7()
  await db.insert(users).values({ id })
  return id
}

/** Inserts a fresh activity and returns its id. */
export async function seedActivity(db: DB, url?: string): Promise<string> {
  const id = uuidv7()
  await db.insert(activities).values({ id, url: url ?? `https://content.test/${uuidv7()}` })
  return id
}

export type LineItemOverrides = Partial<
  Pick<
    LineItemRecord,
    | 'lineitem_url'
    | 'scope_id'
    | 'lti_user_id'
    | 'submittable_progress'
    | 'submitted_progress'
    | 'submission_eligible_at'
    | 'submission_lease_expires_at'
    | 'submission_lease_token'
    | 'submission_error_count'
    | 'dead_at'
    | 'cutoff_at'
    | 'submitted_at'
  >
>

/**
 * Inserts a line item against a scenario. Defaults describe an item that is
 * immediately eligible for submission (backlog present, no lease, eligible now).
 */
export async function seedLineItem(
  db: DB,
  scenario: Scenario,
  overrides: LineItemOverrides = {}
): Promise<LineItemRecord> {
  const [row] = await db
    .insert(lineitems)
    .values({
      id: uuidv7(),
      user_id: scenario.userId,
      activity_id: scenario.activityId,
      scope_id: overrides.scope_id ?? DEFAULT_SCOPE_ID,
      platform_issuer: scenario.issuer,
      deployment_id: scenario.deploymentId,
      lineitem_url: overrides.lineitem_url ?? `https://canvas.test/lineitems/${uuidv7()}`,
      lti_user_id: overrides.lti_user_id ?? 'lti-user-1',
      submittable_progress: overrides.submittable_progress ?? 0.5,
      submitted_progress: overrides.submitted_progress ?? 0,
      // Distinguish an explicit `null` (test wants no eligibility) from "unset"
      // (default to immediately-eligible); `??` would collapse the two.
      submission_eligible_at:
        'submission_eligible_at' in overrides
          ? overrides.submission_eligible_at
          : new Date(Date.now() - 60_000),
      submission_lease_expires_at: overrides.submission_lease_expires_at ?? null,
      submission_lease_token: overrides.submission_lease_token ?? null,
      submission_error_count: overrides.submission_error_count ?? 0,
      dead_at: overrides.dead_at ?? null,
      cutoff_at: overrides.cutoff_at ?? null,
      submitted_at: overrides.submitted_at ?? null,
    })
    .returning()

  if (row == null) {
    throw new Error('seedLineItem: insert returned no row')
  }
  return row
}

/** Inserts a progress high-water-mark row for a user/activity. */
export async function seedProgress(
  db: DB,
  userId: string,
  activityId: string,
  value: number,
  scopeId: string = DEFAULT_SCOPE_ID
): Promise<void> {
  await db
    .insert(progress)
    .values({ user_id: userId, activity_id: activityId, scope_id: scopeId, progress: value })
}

/** Inserts a raw progress event (the cutoff-aware history `getProgressAtCutoff` reads). */
export async function seedProgressEvent(
  db: DB,
  userId: string,
  activityId: string,
  value: number,
  submittedAt: Date,
  scopeId: string = DEFAULT_SCOPE_ID
): Promise<void> {
  await db.insert(progressEvents).values({
    user_id: userId,
    activity_id: activityId,
    scope_id: scopeId,
    progress: value,
    submitted_at: submittedAt,
  })
}
