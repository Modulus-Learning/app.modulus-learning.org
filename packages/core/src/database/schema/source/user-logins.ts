import { index, inet, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const userLoginOutcome = pgEnum('user_login_outcome', [
  'success',
  'failed_no_password',
  'failed_bad_password',
  'failed_disabled',
])

export const userLogins = pgTable(
  'user_logins',
  {
    // When did the login take place?
    time: timestamp('time', { withTimezone: true }).notNull(),

    // The id of the user who logged in -- can be null for certain failed login
    // attempts.  While non-null values here will generally reference the 'id'
    // column in the users table, this is purposefully not a foreign key.  The
    // main reason is that this table is meant to be insert-only (no updates or
    // random deletions -- the only deletions should be all records older than a
    // certain date).  This will be especially beneficial if/when we switch this
    // to a to timescaledb hypertable.  If user_id was a foreign key, we'd need
    // an ON DELETE option, and SET NULL or CASCADE violate the insert-only
    // requirement.  NO ACTION / RESTRICT could work, but would mean that user
    // records couldn't be fully deleted.
    user_id: uuid('user_id'),

    // The login provider, e.g. 'password', 'google', 'lti', etc.
    // TODO: Should this be an enum as well?
    provider: text('provider').notNull(),

    // The ip address from which the login originated.
    ip_address: inet('ip_address'),

    // What was the outcome of the login attempt.
    outcome: userLoginOutcome().notNull(),
  },
  (table) => [
    index('user_logins_time_idx').on(table.time.desc()),
    index('user_logins_outcome_idx').on(table.outcome, table.time.desc()),
    // index('user_logins_user_time_idx')
    //   .on(table.user_id, table.time.desc())
    //   .where(sql`${table.user_id} IS NOT NULL`),
    index('user_logins_time_outcome_idx').on(table.time.desc(), table.outcome),
  ]
)
