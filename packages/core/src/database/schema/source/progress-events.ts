import { index, pgTable, real, timestamp, uuid } from 'drizzle-orm/pg-core'

import { DEFAULT_SCOPE_ID } from '../constants.js'
import { activities } from './activities.js'
import { scopes } from './scopes.js'
import { users } from './users.js'

/*
 * This table is not currently a timescale db hypertable, but its schema is
 * designed so that, if needed, we can call create_hypertable on it later.
 */
export const progressEvents = pgTable(
  'progress_events',
  {
    submitted_at: timestamp('submitted_at', { precision: 6, withTimezone: true }).notNull(),
    user_id: uuid('user_id')
      .notNull()
      // TODO: is ON DELETE CASCADE appropriate?  Perhaps drop the NOT NULL constraint,
      // and use ON DELETE SET NULL instead.  Or drop the FK constraint entirely.
      .references(() => users.id, { onDelete: 'cascade' }),
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'restrict' }),
    scope_id: uuid('scope_id')
      .notNull()
      .default(DEFAULT_SCOPE_ID)
      .references(() => scopes.id, { onDelete: 'restrict' }),
    // The activity that *caused* this event, when it is a cumulative
    // ("umbrella") contribution rather than a direct submission.  NULL for a
    // direct/self submission; set to the source activity for a contribution
    // event (where `activity_id` is the cumulative target).
    source_activity_id: uuid('source_activity_id').references(() => activities.id, {
      onDelete: 'restrict',
    }),
    progress: real('progress').notNull(),
  },
  (table) => [
    index('progress_events_activity_id_scope_id_idx').on(
      table.activity_id,
      table.scope_id,
      table.submitted_at.desc()
    ),
    index('progress_events_user_id_activity_id_scope_id_idx').on(
      table.user_id,
      table.activity_id,
      table.scope_id,
      table.submitted_at.desc()
    ),
  ]
)
