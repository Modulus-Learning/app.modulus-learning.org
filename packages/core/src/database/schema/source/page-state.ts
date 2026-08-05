import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'

import { DEFAULT_SCOPE_ID } from '../constants.js'
import { activities } from './activities.js'
import { scopes } from './scopes.js'
import { users } from './users.js'

export const pageState = pgTable(
  'page_state',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    scope_id: uuid('scope_id')
      .notNull()
      .default(DEFAULT_SCOPE_ID)
      .references(() => scopes.id, { onDelete: 'restrict' }),
    // TODO: Would JSON/JSONB be better?
    state: text('state').notNull().default('{}'),
  },
  (table) => [
    primaryKey({
      columns: [table.user_id, table.activity_id, table.scope_id],
    }),
  ]
)

export const pageStateRelations = relations(pageState, ({ one }) => ({
  activity: one(activities, {
    fields: [pageState.activity_id],
    references: [activities.id],
  }),
  user: one(users, {
    fields: [pageState.user_id],
    references: [users.id],
  }),
  scope: one(scopes, {
    fields: [pageState.scope_id],
    references: [scopes.id],
  }),
}))
