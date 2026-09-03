import { boolean, pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../common.js'
import { adminUsers } from './admin-users.js'

/**
 * The sitewide activity URL allowlist.
 *
 * Each row admits new activity URLs under one normalized origin and path
 * prefix. A rule governs admission only: it never affects an activity Modulus
 * has already accepted, so editing, disabling or deleting a rule cannot
 * withdraw access to existing content.
 *
 * The policy is deny-by-default — with no enabled rules, nothing new is
 * admitted. There is deliberately no seed for this table.
 *
 * Provenance references `admin_users`, never `users`, so the table holds no
 * learner or instructor data. `on delete set null` keeps a rule alive when the
 * administrator who wrote it is removed.
 */
export const activityUrlAllowlistRules = pgTable(
  'activity_url_allowlist_rules',
  {
    id: uuid('id').primaryKey().notNull(),

    // Normalized origin the rule admits, e.g. `https://ximera.osu.edu`
    origin: varchar('origin', { length: 255 }).notNull(),

    // Normalized path prefix within that origin. `/` admits the whole origin;
    // anything else admits only the path-segment-bounded subtree beneath it.
    // Defaults to `/` rather than being nullable so the uniqueness constraint
    // needs no `NULLS NOT DISTINCT` reasoning.
    path_prefix: varchar('path_prefix', { length: 255 }).notNull().default('/'),

    // Administrator-authored note explaining why the rule exists
    description: varchar('description', { length: 1024 }),

    // Disabled rules are retained with their description and provenance, and
    // admit nothing while disabled.
    is_enabled: boolean('is_enabled').notNull().default(true),

    created_by: uuid('created_by').references(() => adminUsers.id, { onDelete: 'set null' }),
    updated_by: uuid('updated_by').references(() => adminUsers.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (table) => [
    unique('activity_url_allowlist_rules_origin_path_prefix_idx').on(
      table.origin,
      table.path_prefix
    ),
  ]
)
