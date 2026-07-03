import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../../common.js'
import { platformIncidents } from './lti-platform-incidents.js'
import { platforms } from './lti-platforms.js'

/**
 * Current-state mirror of a platform's submission health, one row per platform.
 * The in-memory circuit breaker is authoritative for pacing; this row is its
 * durable shadow, written on transitions to seed a restarting process and for
 * observability. `last_success_at` is the death-gate's health input.
 */
export const platformHealth = pgTable('lti_platform_health', {
  platform_issuer: varchar('platform_issuer')
    .primaryKey()
    .references(() => platforms.issuer, { onDelete: 'cascade' }),

  status: varchar('status').notNull().default('healthy'),

  paused_until: timestamp('paused_until', { precision: 6, withTimezone: true }),

  last_success_at: timestamp('last_success_at', { precision: 6, withTimezone: true }),
  last_failure_at: timestamp('last_failure_at', { precision: 6, withTimezone: true }),

  consecutive_failures: integer('consecutive_failures').notNull().default(0),

  // Pointer to the currently-open incident for this platform, if any.
  open_incident_id: uuid('open_incident_id').references(() => platformIncidents.id, {
    onDelete: 'set null',
  }),

  ...timestamps,
})
