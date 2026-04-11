import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { users } from './users.js'

export const agentAuthCodes = pgTable('agent_auth_codes', {
  code: varchar('code').primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  client_id: varchar('client_id').notNull(),
  redirect_uri: varchar('redirect_uri').notNull(),
  code_challenge: varchar('code_challenge').notNull(),
  expires_at: timestamp('expires_at', { precision: 0, withTimezone: true }).notNull(),
})
