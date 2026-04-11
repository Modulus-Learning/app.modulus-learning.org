import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

export const platforms = pgTable('lti_platforms', {
  id: uuid('id').primaryKey(),
  issuer: varchar('issuer').notNull().unique(),
  name: varchar('name').notNull(),
  client_id: varchar('client_id').notNull(),
  authorization_endpoint: varchar('authorization_endpoint').notNull(),
  token_endpoint: varchar('token_endpoint').notNull(),
  jwks_uri: varchar('jwks_uri').notNull(),
  authorization_server: varchar('authorization_server').notNull(),
  deployment_id: varchar('deployment_id'),
})
