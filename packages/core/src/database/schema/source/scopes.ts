import { relations, sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { DEFAULT_SCOPE_ID } from '../constants.js'
import { platforms } from './lti/lti-platforms.js'

const defaultScopeSql = sql.raw(`'${DEFAULT_SCOPE_ID}'::uuid`)

export const scopes = pgTable(
  'scopes',
  {
    id: uuid('id').primaryKey(),
    platform_id: uuid('platform_id').references(() => platforms.id, { onDelete: 'restrict' }),
    external_id: text('external_id'),
    name: text('name'),
    starts_at: timestamp('starts_at', { precision: 6, withTimezone: true }),
    ends_at: timestamp('ends_at', { precision: 6, withTimezone: true }),
    last_verified_launch_at: timestamp('last_verified_launch_at', {
      precision: 6,
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    unique('scopes_platform_id_external_id_unique').on(table.platform_id, table.external_id),
    check(
      'scopes_identity_check',
      sql`(
        (${table.id} = ${defaultScopeSql} AND ${table.platform_id} IS NULL AND ${table.external_id} IS NULL)
        OR
        (${table.id} <> ${defaultScopeSql} AND ${table.platform_id} IS NOT NULL AND ${table.external_id} IS NOT NULL)
      )`
    ),
  ]
)

export const scopesRelations = relations(scopes, ({ one }) => ({
  platform: one(platforms, {
    fields: [scopes.platform_id],
    references: [platforms.id],
  }),
}))
