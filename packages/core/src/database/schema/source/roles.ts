import { relations } from 'drizzle-orm'
import { integer, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { roleUser } from './role-user.js'

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().notNull(),
  vid: integer('vid').notNull().default(1),
  name: varchar('name', { length: 128 }).notNull(),
  machine_name: varchar('machine_name', { length: 128 }).notNull().unique(),
  description: text('description'),
  order: integer('order').notNull().default(0),
  ...timestamps,
})

export const rolesRelations = relations(roles, ({ many }) => ({
  role_user: many(roleUser),
}))
