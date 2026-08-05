import { relations, sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps } from '../../common.js'
import { DEFAULT_SCOPE_ID } from '../../constants.js'
import { activities } from '../activities.js'
import { scopes } from '../scopes.js'
import { users } from '../users.js'
import { platformDeployments } from './lti-platform-deployments.js'
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

    // Academic-term bucket used for activity state and score passback
    scope_id: uuid('scope_id')
      .notNull()
      .default(DEFAULT_SCOPE_ID)
      .references(() => scopes.id, { onDelete: 'restrict' }),

    // LTI platform this line item belongs to
    platform_issuer: varchar('platform_issuer').notNull(),

    // LTI deployment this line item belongs to
    deployment_id: varchar('deployment_id').notNull(),

    // Base URL of the line item in the LTI platform
    lineitem_url: varchar('lineitem_url').notNull(),

    // ID of the user in the LTI platform
    lti_user_id: varchar('lti_user_id', { length: 255 }).notNull(),

    // Optional cutoff date as reported by the LTI platform.
    cutoff_at: timestamp('cutoff_at', { precision: 6, withTimezone: true }),

    // Optional ID and name of the associated course in the LTI platform
    // context_id: varchar('course_id'),
    // context_title: varchar('course_name'),

    // Optional ID and name of the associated assignment in the LTI platform
    // assignment_id: varchar('assignment_id'),
    // assignment_name: varchar('assignment_name'),

    // When, if ever, the lineitem was deemed no-longer-submittable (either
    // due to cutoff_at having passed, or a submission error that indicates
    // further retries will not succeed).
    dead_at: timestamp('dead_at', { precision: 6, withTimezone: true }),

    // Last progress value that was successfully submitted to the LTI platform
    submitted_progress: real('submitted_progress').notNull().default(0),

    // Timestamp of the last successful score submission to the LTI platform.
    submitted_at: timestamp('submitted_at', { precision: 6, withTimezone: true }),

    // High-water mark progress value that can be submitted for this lineitem
    // (based on progress events recieved before cutoff_at)
    submittable_progress: real('submittable_progress').notNull(),

    // When will this lineitem next be eligible for submission?  Used for
    // submission throttling and cooldown-after-error
    submission_eligible_at: timestamp('submission_eligible_at', {
      precision: 6,
      withTimezone: true,
    }),

    // Set to NOW() + <lock timeout period> when a worker claims this line item
    // for submission.
    submission_lease_expires_at: timestamp('submission_lease_expires_at', {
      precision: 6,
      withTimezone: true,
    }),

    // Uniquely-generated token set by worker when it claims this line item for
    // submission.
    submission_lease_token: uuid('submission_lease_token'),

    // Number of consecutive failed submission attempts. Reset to 0 on success.
    // Used to compute backoff.
    submission_error_count: integer('submission_error_count').notNull().default(0),

    // Category of the latest error.  Used to determine submission_error_count
    // increment, and eventual transition to 'dead' state.
    submission_error_category: text('submission_error_category'),

    // Diagnostic: the error message from the most recent failed submission
    // attempt. Cleared on success.
    submission_error_message: text('submission_error_message'),

    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'lti_lineitems_platform_issuer_deployment_id_fk',
      columns: [table.platform_issuer, table.deployment_id],
      foreignColumns: [platformDeployments.platform_issuer, platformDeployments.deployment_id],
    }),
    unique('lti_lineitems_user_id_activity_id_lineitem_url_idx').on(
      table.user_id,
      table.activity_id,
      table.lineitem_url
    ),
    index('lti_lineitems_user_id_activity_id_idx').on(table.user_id, table.activity_id),
    index('lti_lineitems_eligible_idx')
      .on(table.platform_issuer, table.submission_eligible_at)
      .where(
        sql`${table.dead_at} IS NULL AND ${table.submittable_progress} > ${table.submitted_progress}`
      ),
  ]
)

export const lineitemsRelations = relations(lineitems, ({ one }) => ({
  user: one(users, { fields: [lineitems.user_id], references: [users.id] }),
  activity: one(activities, { fields: [lineitems.activity_id], references: [activities.id] }),
  scope: one(scopes, { fields: [lineitems.scope_id], references: [scopes.id] }),
  platform: one(platforms, { fields: [lineitems.platform_issuer], references: [platforms.issuer] }),
}))
