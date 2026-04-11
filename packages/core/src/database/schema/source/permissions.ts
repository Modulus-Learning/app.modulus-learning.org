import { integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { roles } from './roles.js'

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().notNull(),
  vid: integer('vid').notNull().default(1),
  role_id: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  ability: varchar('ability', { length: 128 }).notNull(),
  ...timestamps,
})
