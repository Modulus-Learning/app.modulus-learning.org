import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { users } from './users.js'

export const agentRefreshTokens = pgTable('agent_refresh_tokens', {
  id: varchar('id').primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires_at: timestamp('expires_at', { precision: 6, withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { precision: 6, withTimezone: true }),
})
