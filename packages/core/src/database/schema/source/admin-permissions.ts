import { integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { adminRoles } from './admin-roles.js'

export const adminPermissions = pgTable('admin_permissions', {
  id: uuid('id').primaryKey().notNull(),
  vid: integer('vid').notNull().default(1),
  admin_role_id: uuid('admin_role_id')
    .notNull()
    .references(() => adminRoles.id, { onDelete: 'cascade' }),
  ability: varchar('ability', { length: 128 }).notNull(),
  ...timestamps,
})
