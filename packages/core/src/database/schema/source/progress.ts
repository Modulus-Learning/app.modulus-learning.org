import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, real, uuid } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { DEFAULT_SCOPE_ID } from '../constants.js'
import { activities } from './activities.js'
import { scopes } from './scopes.js'
import { users } from './users.js'

export const progress = pgTable(
  'progress',
  {
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope_id: uuid('scope_id')
      .notNull()
      .default(DEFAULT_SCOPE_ID)
      .references(() => scopes.id, { onDelete: 'restrict' }),
    progress: real('progress').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.activity_id, table.user_id, table.scope_id],
    }),
  ]
)

export const progressRelations = relations(progress, ({ one }) => ({
  user: one(users, {
    fields: [progress.user_id],
    references: [users.id],
  }),
  activity: one(activities, {
    fields: [progress.activity_id],
    references: [activities.id],
  }),
  scope: one(scopes, {
    fields: [progress.scope_id],
    references: [scopes.id],
  }),
}))
