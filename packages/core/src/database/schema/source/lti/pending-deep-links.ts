import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from '../users.js'

// A deep-linking launch persisted between the platform's LtiDeepLinkingRequest
// and the instructor completing the deep-link form.  We store only the fields
// the deep-link response is built from (plus the resolved user, for the
// ownership check) rather than the whole id_token.  Rows are short-lived
// (expires_at, ~1h).
export const pendingDeepLinks = pgTable('pending_deep_links', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  issuer: text('issuer').notNull(),
  deployment_id: text('deployment_id').notNull(),
  deep_linking_data: text('deep_linking_data'),
  return_url: text('return_url').notNull(),
  context: text('context'),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
})
