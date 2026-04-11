import { relations } from 'drizzle-orm'
import { index, pgTable, real, unique, uuid, varchar } from 'drizzle-orm/pg-core'

import { activities } from '../activities.js'
import { users } from '../users.js'
import { platforms } from './lti-platforms.js'

export const lineitems = pgTable(
  'lti_lineitems',
  {
    id: uuid('id').primaryKey(),

    // User whose progress will be reported under this line item
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Activity for which progress will be reported under this line item
    activity_id: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),

    // Base URL of the line item in the LTI platform
    lineitem_url: varchar('lineitem_url').notNull(),

    // Last progress value that was successfully submitted to the LTI platform
    submitted_progress: real('submitted_progress').notNull(),

    // LTI platform that this line item belongs to
    platform_issuer: varchar('platform_issuer')
      .notNull()
      .references(() => platforms.issuer, { onDelete: 'cascade' }),

    // ID of the user in the LTI platform
    lti_user_id: varchar('lti_user_id', { length: 255 }).notNull(),

    // Optional ID and name of the associated course in the LTI platform
    // context_id: varchar('course_id'),
    // context_title: varchar('course_name'),

    // Optional ID and name of the associated assignment in the LTI platform
    // assignment_id: varchar('assignment_id'),
    // assignment_name: varchar('assignment_name'),

    // Optional due date as reported by the LTI platform
    // due_date: timestamp('due_date', { withTimezone: true }),
  },
  (table) => [
    unique('lti_lineitems_user_id_activity_id_lineitem_url_idx').on(
      table.user_id,
      table.activity_id,
      table.lineitem_url
    ),
    index('lti_lineitems_user_id_activity_id_idx').on(table.user_id, table.activity_id),
  ]
)

export const lineitemsRelations = relations(lineitems, ({ one }) => ({
  user: one(users, { fields: [lineitems.user_id], references: [users.id] }),
  activity: one(activities, { fields: [lineitems.activity_id], references: [activities.id] }),
  platform: one(platforms, { fields: [lineitems.platform_issuer], references: [platforms.issuer] }),
}))
