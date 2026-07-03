import { sql } from 'drizzle-orm'
import { index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../../common.js'
import { platforms } from './lti-platforms.js'

/**
 * One row per platform-level incident episode. An incident opens when the
 * driver's circuit breaker trips, spans any number of breaker open/close cycles
 * (a hysteretic envelope), and is closed only by the driver after sustained
 * recovery. Aggregates are maintained in driver memory and flushed on
 * transitions, so a crash leaves the last-flushed values.
 */
export const platformIncidents = pgTable(
  'lti_platform_incidents',
  {
    id: uuid('id').primaryKey(),
    platform_issuer: varchar('platform_issuer')
      .notNull()
      .references(() => platforms.issuer, { onDelete: 'cascade' }),

    // First failure of the triggering run (backdated at declaration), NOT the
    // declaration moment. The numerator of the notifier's active-span gate.
    opened_at: timestamp('opened_at', { precision: 6, withTimezone: true }).notNull(),
    // Most recent failure attributed to this incident. The recovery clock's
    // anchor and the active-span gate's other end.
    last_failure_at: timestamp('last_failure_at', { precision: 6, withTimezone: true }).notNull(),
    // Set once the platform is sustainably healthy again. NULL <=> open.
    resolved_at: timestamp('resolved_at', { precision: 6, withTimezone: true }),

    // 'high' | 'low'. Derived from categories_seen; rate_limit-only => 'low'
    // and never pages. May escalate while open.
    severity: varchar('severity').notNull(),
    trigger_category: varchar('trigger_category').notNull(),
    categories_seen: varchar('categories_seen').array().notNull().default(sql`'{}'::varchar[]`),

    // Volume + breadth (page context, not gates). Maintained in driver memory.
    failure_count: integer('failure_count').notNull().default(0),
    distinct_affected_lineitems: integer('distinct_affected_lineitems').notNull().default(0),

    // Two-latch notification lifecycle: paged the alarm / sent the all-clear.
    notified_at: timestamp('notified_at', { precision: 6, withTimezone: true }),
    resolved_notified_at: timestamp('resolved_notified_at', { precision: 6, withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    // At most one open incident per platform.
    uniqueIndex('lti_platform_incidents_one_open_idx')
      .on(table.platform_issuer)
      .where(sql`${table.resolved_at} IS NULL`),
    // Notifier: open, not-yet-paged candidates, oldest first.
    index('lti_platform_incidents_unnotified_idx')
      .on(table.opened_at)
      .where(sql`${table.resolved_at} IS NULL AND ${table.notified_at} IS NULL`),
    // Notifier: paged incidents awaiting an all-clear.
    index('lti_platform_incidents_allclear_idx')
      .on(table.resolved_at)
      .where(sql`${table.notified_at} IS NOT NULL AND ${table.resolved_notified_at} IS NULL`),
    // Dev review: a platform's incidents over time (incl. closed).
    index('lti_platform_incidents_issuer_time_idx').on(table.platform_issuer, table.opened_at),
  ]
)
