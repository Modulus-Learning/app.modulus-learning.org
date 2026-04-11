import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { activities } from './activities.js'
import { activityCodes } from './activity-codes.js'

export const activityActivityCode = pgTable(
  'activity_activity_code',
  {
    activity_code_id: uuid('activity_code_id')
      .notNull()
      .references(() => activityCodes.id), // we cannot be sure that this is the only activity code using this activity and so we do not delete on cascade
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      columns: [table.activity_code_id, table.activity_id],
    }),
  ]
)

export const activityActivityCodeRelation = relations(activityActivityCode, ({ one }) => ({
  activityCodes: one(activityCodes, {
    fields: [activityActivityCode.activity_code_id],
    references: [activityCodes.id],
  }),
  activities: one(activities, {
    fields: [activityActivityCode.activity_id],
    references: [activities.id],
  }),
}))
