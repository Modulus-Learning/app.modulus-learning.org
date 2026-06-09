import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../../common.js'
import { platforms } from './lti-platforms.js'

export const platformHealth = pgTable('lti_platform_health', {
  platform_issuer: varchar('platform_issuer')
    .primaryKey()
    .references(() => platforms.issuer, { onDelete: 'cascade' }),

  status: varchar('status').notNull().default('healthy'),

  paused_until: timestamp('paused_until', { precision: 6, withTimezone: true }),

  last_success_at: timestamp('last_success_at', { precision: 6, withTimezone: true }),
  last_failure_at: timestamp('last_failure_at', { precision: 6, withTimezone: true }),

  consecutive_failures: integer('consecutive_failures').notNull().default(0),

  // incident_category: varchar('incident_category'),
  // incident_started_at: timestamp('incident_started_at', { precision: 6, withTimezone: true }),
  // incident_notified_at: timestamp('incident_notified_at', { precision: 6, withTimezone: true }),

  ...timestamps,
})
