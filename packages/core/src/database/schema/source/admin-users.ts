import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey(),
  vid: integer('vid').notNull().default(1),
  given_name: varchar('given_name', { length: 100 }),
  family_name: varchar('family_name', { length: 100 }),
  username: varchar('username', { length: 26 }).unique(),
  email: varchar('email', { length: 254 }).unique(),
  password: varchar('password', { length: 128 }),
  remember_me: boolean('remember_me').notNull().default(false),
  ...timestamps,
  last_login: timestamp('last_login', { precision: 6, withTimezone: true }).defaultNow(),
  last_login_ip: varchar('last_login_ip', { length: 40 }).notNull().default('0.0.0.0'),
  failed_login_attempts: integer('failed_login_attempts').notNull().default(0),
  is_super_admin: boolean('is_super_admin').notNull().default(false),
  is_enabled: boolean('is_enabled').notNull().default(false),
  is_email_verified: boolean('is_email_verified').notNull().default(false),
})
