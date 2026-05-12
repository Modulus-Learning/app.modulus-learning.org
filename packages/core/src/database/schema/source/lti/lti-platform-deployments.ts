import { pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from '../../common.js'
import { platforms } from './lti-platforms.js'

export const platformDeployments = pgTable(
  'lti_platform_deployments',
  {
    platform_issuer: varchar('platform_issuer')
      .notNull()
      .references(() => platforms.issuer, { onDelete: 'cascade' }),
    deployment_id: varchar('deployment_id').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.platform_issuer, table.deployment_id],
    }),
  ]
)
