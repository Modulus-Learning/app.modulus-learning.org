import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const emailChangeRequests = pgTable(
  'email_change_requests',
  {
    id: uuid('id').primaryKey(),
    user_id: uuid('user_id').notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    verification_code: varchar('verification_code', { length: 50 }).notNull(),
    created_at: timestamp('created_at', { precision: 6, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('user_id_idx').on(table.user_id),
    index('verification_code_idx').on(table.verification_code),
  ]
)
