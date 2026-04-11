import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { roleUser } from './role-user.js'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    vid: integer('vid').notNull().default(1),
    given_name: varchar('given_name', { length: 100 }),
    family_name: varchar('family_name', { length: 100 }),
    full_name: varchar('full_name', { length: 100 }),
    username: varchar('username', { length: 26 }).unique(),
    email: varchar('email', { length: 254 }).unique(),
    password: varchar('password', { length: 128 }),
    github_id: integer('github_id').unique(),
    google_id: varchar('google_id', { length: 30 }).unique(),
    remember_me: boolean('remember_me').notNull().default(false),
    ...timestamps,
    agreed_to_terms: boolean('agreed_to_terms').notNull().default(false),
    last_provider: varchar('last_provider', { length: 50 }),
    last_login: timestamp('last_login', { precision: 6, withTimezone: true }).defaultNow(),
    last_login_ip: varchar('last_login_ip', { length: 40 }).notNull().default('0.0.0.0'),
    failed_login_attempts: integer('failed_login_attempts').notNull().default(0),
    is_enabled: boolean('is_enabled').notNull().default(false),
    is_email_verified: boolean('is_email_verified').notNull().default(false),
    lti_iss: varchar('lti_iss'),
    lti_sub: varchar('lti_sub', { length: 255 }),
  },
  (table) => [
    index('full_name_idx').on(table.full_name),
    index('github_id').on(table.github_id),
    index('google_id').on(table.google_id),
  ]
)

export const usersRelations = relations(users, ({ many }) => ({
  role_user: many(roleUser),
}))
