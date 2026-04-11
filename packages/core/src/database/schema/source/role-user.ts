import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { roles } from './roles.js'
import { users } from './users.js'

export const roleUser = pgTable(
  'role_user',
  {
    role_id: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      columns: [table.role_id, table.user_id],
    }),
  ]
)

export const roleUserRelation = relations(roleUser, ({ one }) => ({
  role: one(roles, {
    fields: [roleUser.role_id],
    references: [roles.id],
  }),
  user: one(users, {
    fields: [roleUser.user_id],
    references: [users.id],
  }),
}))
