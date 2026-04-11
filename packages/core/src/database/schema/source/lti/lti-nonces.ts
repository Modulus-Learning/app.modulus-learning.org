import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

export const nonces = pgTable('lti_nonces', {
  nonce: varchar('nonce', { length: 40 }).primaryKey(),
  used: boolean('used').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
})
