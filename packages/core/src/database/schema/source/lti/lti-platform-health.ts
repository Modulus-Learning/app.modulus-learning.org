import { integer, pgTable, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../../common.js'
import { platforms } from './lti-platforms.js'

export const platformHealth = pgTable('lti_platform_health', {
  platform_issuer: varchar('platform_issuer')
    .primaryKey()
    .references(() => platforms.issuer, { onDelete: 'cascade' }),

  submission_status: varchar('submission_queue_status').notNull().default('healthy'),
  submission_transient_error_count: integer('submission_transient_error_count')
    .notNull()
    .default(0),
  submission_permanent_error_count: integer('submission_permanent_error_count')
    .notNull()
    .default(0),

  ...timestamps,
})
