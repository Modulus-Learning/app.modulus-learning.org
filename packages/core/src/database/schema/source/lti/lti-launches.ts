import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const launches = pgTable('lti_launches', {
  id: uuid('id').primaryKey(),
  launch: text('launch').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
})
