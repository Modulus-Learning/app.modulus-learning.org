import { integer, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'

export const adminRoles = pgTable('admin_roles', {
  id: uuid('id').primaryKey().notNull(),
  vid: integer('vid').notNull().default(1),
  name: varchar('name', { length: 128 }).notNull(),
  machine_name: varchar('machine_name', { length: 128 }).notNull().unique(),
  description: text('description'),
  order: integer('order').notNull().default(0),
  ...timestamps,
})
