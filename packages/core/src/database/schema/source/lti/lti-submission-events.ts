import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { platforms } from './lti-platforms.js'

export const submissionEvents = pgTable(
  'lti_submission_events',
  {
    id: uuid('id').primaryKey(),
    platform_issuer: varchar('platform_issuer')
      .notNull()
      .references(() => platforms.issuer, { onDelete: 'cascade' }),

    deployment_id: varchar('deployment_id'),

    // TODO: Denormalize data from lineitems table here?
    lineitem_id: uuid('lineitem_id'),

    // Event time
    occurred_at: timestamp('occurred_at', { precision: 6, withTimezone: true })
      .notNull()
      .defaultNow(),

    // Either 'failure' or 'recovery'
    outcome: varchar('outcome').notNull(),

    // One of SubmissionErrorCategory variants, or null when outcome = 'recovery'
    category: varchar('category'),

    // Http status code for error events, if any
    http_status: integer('http_status'),

    // Human-readable message briefly identifying specific failure mode
    detail: text('detail'),
  },
  (table) => [
    index('lti_submission_events_issuer_time_idx').on(table.platform_issuer, table.occurred_at),
  ]
)
