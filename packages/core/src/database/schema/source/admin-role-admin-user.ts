import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { adminRoles } from './admin-roles.js'
import { adminUsers } from './admin-users.js'

export const adminRoleAdminUser = pgTable(
  'admin_role_admin_user',
  {
    admin_role_id: uuid('admin_role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'cascade' }),
    admin_user_id: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({
      columns: [table.admin_role_id, table.admin_user_id],
    }),
  ]
)
