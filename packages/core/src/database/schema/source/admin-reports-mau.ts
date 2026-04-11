import { integer, pgTable, primaryKey } from 'drizzle-orm/pg-core'

export const adminReportsMau = pgTable(
  'admin_reports_mau',
  {
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    total: integer('total').notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.year, table.month], // Correct object syntax for primary key
    }),
  ]
)
