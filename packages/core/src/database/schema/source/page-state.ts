import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'

import { activities } from './activities.js'
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
    // TODO: Would JSON/JSONB be better?
    state: text('state').notNull().default('{}'),
  },
  (table) => [
    primaryKey({
      columns: [table.user_id, table.activity_id],
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
}))
