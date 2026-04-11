import { relations } from 'drizzle-orm'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { enrollment } from './enrollment.js'
import { progress } from './progress.js'

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().notNull(),
  url: varchar('url', { length: 255 }).notNull().unique(),
  name: varchar('name'),
  ...timestamps,
})

export const activitiesRelations = relations(activities, ({ many }) => ({
  enrollment: many(enrollment),
  progress: many(progress),
}))
