import { relations } from 'drizzle-orm'
import { index, integer, pgTable, real, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'

import { activities } from '../activities.js'
import { users } from '../users.js'
import { platforms } from './lti-platforms.js'

export const lineitems = pgTable(
  'lti_lineitems',
  {
    id: uuid('id').primaryKey(),

    // User whose progress will be reported under this line item
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Activity for which progress will be reported under this line item
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),

    // Base URL of the line item in the LTI platform
    lineitem_url: varchar('lineitem_url').notNull(),

    // Last progress value that was successfully submitted to the LTI platform
    submitted_progress: real('submitted_progress').notNull(),

    // LTI platform that this line item belongs to
    platform_issuer: varchar('platform_issuer')
      .notNull()
      .references(() => platforms.issuer, { onDelete: 'cascade' }),

    // ID of the user in the LTI platform
    lti_user_id: varchar('lti_user_id', { length: 255 }).notNull(),

    // Optional ID and name of the associated course in the LTI platform
    // context_id: varchar('course_id'),
    // context_title: varchar('course_name'),

    // Optional ID and name of the associated assignment in the LTI platform
    // assignment_id: varchar('assignment_id'),
    // assignment_name: varchar('assignment_name'),

    // Optional due date as reported by the LTI platform
    // due_date: timestamp('due_date', { withTimezone: true }),

    // --- Score submission tracking ---

    // Set to NOW() when a worker claims this line item for submission.
    // Null when no submission is in flight. Used as a lock to prevent
    // concurrent submission attempts, and as a staleness indicator for
    // crash recovery (if older than a threshold, the lock is considered stale).
    submission_locked_at: timestamp('submission_locked_at', { precision: 6, withTimezone: true }),

    // Number of consecutive failed submission attempts. Reset to 0 on success.
    // Used to compute exponential backoff delay on retry.
    submission_attempts: integer('submission_attempts').notNull().default(0),

    // Earliest time at which this line item is eligible for another submission
    // attempt. Set on failure to NOW() + backoff. Null when not in a backoff
    // period (i.e. after success, or when never attempted).
    submission_next_retry_at: timestamp('submission_next_retry_at', { precision: 6, withTimezone: true }),

    // Diagnostic: the error message from the most recent failed submission
    // attempt. Cleared on success.
    submission_last_error: text('submission_last_error'),
  },
  (table) => [
    unique('lti_lineitems_user_id_activity_id_lineitem_url_idx').on(
      table.user_id,
      table.activity_id,
      table.lineitem_url
    ),
    index('lti_lineitems_user_id_activity_id_idx').on(table.user_id, table.activity_id),
  ]
)

export const lineitemsRelations = relations(lineitems, ({ one }) => ({
  user: one(users, { fields: [lineitems.user_id], references: [users.id] }),
  activity: one(activities, { fields: [lineitems.activity_id], references: [activities.id] }),
  platform: one(platforms, { fields: [lineitems.platform_issuer], references: [platforms.issuer] }),
}))
