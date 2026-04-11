import { boolean, integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'

export const registrations = pgTable('registrations', {
  id: uuid('id').primaryKey(),
  full_name: varchar('full_name', { length: 100 }).notNull(),
  username: varchar('username', { length: 26 }).unique(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  agreed_to_terms: boolean('agreed_to_terms').notNull().default(false),
  is_email_verified: boolean('is_email_verified').notNull().default(false),
  verification_code: varchar('verification_code', { length: 50 }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  ip: varchar('ip', { length: 40 }).notNull().default('0.0.0.0'),
  ...timestamps,
})
