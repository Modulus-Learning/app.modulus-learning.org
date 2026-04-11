import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { activities } from './activities.js'
import { activityCodes } from './activity-codes.js'
import { progress } from './progress.js'
import { users } from './users.js'

export const enrollment = pgTable(
  'enrollment',
  {
    activity_code_id: uuid('activity_code_id')
      .notNull()
      .references(() => activityCodes.id, { onDelete: 'cascade' }),
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      columns: [table.activity_code_id, table.activity_id, table.user_id],
    }),
  ]
)

export const enrollmentProgressRelations = relations(enrollment, ({ one }) => ({
  activityCode: one(activityCodes, {
    fields: [enrollment.activity_code_id],
    references: [activityCodes.id],
  }),
  activity: one(activities, {
    fields: [enrollment.activity_id],
    references: [activities.id],
  }),
  user: one(users, {
    fields: [enrollment.user_id],
    references: [users.id],
  }),
  progress: one(progress, {
    fields: [enrollment.activity_id, enrollment.user_id],
    references: [progress.activity_id, progress.user_id],
  }),
}))
