import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { platformIncidents } from './lti-platform-incidents.js'
import { platforms } from './lti-platforms.js'

/**
 * Append-only failure log — the single place per-failure detail lives, for
 * post-hoc debugging and classifier improvement. Failure-only: a recovery is
 * `lti_platform_incidents.resolved_at`, not a row here. This is the only
 * unbounded table in the subsystem and the one that will need a retention /
 * partition policy.
 *
 * Replaces the former `lti_submission_events`.
 */
export const submissionFailures = pgTable(
  'lti_submission_failures',
  {
    id: uuid('id').primaryKey(),
    platform_issuer: varchar('platform_issuer')
      .notNull()
      .references(() => platforms.issuer, { onDelete: 'cascade' }),

    // The incident this failure belongs to, if any.
    //   incident_id = X     -> "everything inside that outage" (join)
    //   incident_id IS NULL -> isolated failure, platform was healthy: the
    //                          item-at-fault candidates a death-gate would audit.
    incident_id: uuid('incident_id').references(() => platformIncidents.id, {
      onDelete: 'set null',
    }),

    // Which item failed (no FK: keep the row even if the line item is later gone).
    lineitem_id: uuid('lineitem_id'),
    deployment_id: varchar('deployment_id'),

    occurred_at: timestamp('occurred_at', { precision: 6, withTimezone: true })
      .notNull()
      .defaultNow(),

    // A SubmissionErrorCategory variant. Always present (failure-only table).
    category: varchar('category').notNull(),
    http_status: integer('http_status'),
    detail: text('detail'),
  },
  (table) => [
    index('lti_submission_failures_issuer_time_idx').on(table.platform_issuer, table.occurred_at),
    index('lti_submission_failures_incident_idx').on(table.incident_id),
    // The isolated-failure audit (classifier improvement).
    index('lti_submission_failures_isolated_idx')
      .on(table.platform_issuer, table.category, table.occurred_at)
      .where(sql`${table.incident_id} IS NULL`),
  ]
)
