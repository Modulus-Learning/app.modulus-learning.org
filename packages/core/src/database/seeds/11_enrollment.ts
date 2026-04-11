import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { enrollment } from '../schema/source/enrollment.js'
import type * as schema from '../schema/index.js'

export const seedEnrollment = async (
  db: NodePgDatabase<typeof schema>,
  userIds: { id: string }[],
  activityCodeIds: { id: string }[],
  activityIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Activity codes activity user data
  const initialEnrollments: (typeof enrollment.$inferInsert)[] = [
    {
      user_id: userIds[3]!.id,
      activity_code_id: activityCodeIds[0]!.id,
      activity_id: activityIds[0]!.id,
    },
    {
      user_id: userIds[3]!.id,
      activity_code_id: activityCodeIds[1]!.id,
      activity_id: activityIds[1]!.id,
    },
    {
      user_id: userIds[3]!.id,
      activity_code_id: activityCodeIds[2]!.id,
      activity_id: activityIds[2]!.id,
    },
  ]

  // Bulk enrollment
  const generateBulkEnrollments = (
    userIds: { id: string }[],
    activityCodeIds: { id: string }[],
    activityIds: { id: string }[]
  ) => {
    const bulkEnrollmentData: (typeof enrollment.$inferInsert)[] = []
    for (let i = 5; i < 5005; i++) {
      bulkEnrollmentData.push({
        user_id: userIds[i]!.id,
        activity_code_id: activityCodeIds[3]!.id,
        activity_id: activityIds[1]!.id,
      })
    }
    return bulkEnrollmentData
  }

  const bulkEnrollmentData = generateBulkEnrollments(userIds, activityCodeIds, activityIds)

  const enrollmentData = [...initialEnrollments, ...bulkEnrollmentData]

  console.log('Seed activity_code_activity_user start')
  await db.insert(enrollment).values(enrollmentData)
  console.log('Seed activity_code_activity_user done')
}
