import { index, pgTable, real, timestamp, uuid } from 'drizzle-orm/pg-core'

import { activities } from './activities.js'
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
    progress: real('progress').notNull(),
  },
  (table) => [
    index('progress_events_activity_id_idx').on(table.activity_id, table.submitted_at.desc()),
    index('progress_events_user_id_activity_id_idx').on(
      table.user_id,
      table.activity_id,
      table.submitted_at.desc()
    ),
  ]
)
