import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { DEFAULT_SCOPE_ID } from '../constants.js'
import { scopes } from './scopes.js'
import { users } from './users.js'

export const agentAuthCodes = pgTable('agent_auth_codes', {
  code: varchar('code').primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scope_id: uuid('scope_id')
    .notNull()
    .default(DEFAULT_SCOPE_ID)
    .references(() => scopes.id, { onDelete: 'restrict' }),
  client_id: varchar('client_id').notNull(),
  redirect_uri: varchar('redirect_uri').notNull(),
  code_challenge: varchar('code_challenge').notNull(),
  expires_at: timestamp('expires_at', { precision: 0, withTimezone: true }).notNull(),
})
