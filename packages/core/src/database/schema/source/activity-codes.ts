import { relations } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { enrollment } from './enrollment.js'
import { users } from './users.js'

export const activityCodes = pgTable('activity_codes', {
  id: uuid('id').primaryKey().notNull(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 255 }).notNull().unique(),
  private_code: varchar('private_code', { length: 255 }).notNull().unique(),
  url_prefix: varchar('url_prefix', { length: 255 }),
  ...timestamps,
})

export const activityCodesRelations = relations(activityCodes, ({ one, many }) => ({
  user: one(users, {
    fields: [activityCodes.user_id],
    references: [users.id],
  }),
  enrollment: many(enrollment),
}))
