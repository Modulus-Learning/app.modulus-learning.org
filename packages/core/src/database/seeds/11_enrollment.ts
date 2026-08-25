import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { enrollment } from '../schema/source/enrollment.js'
import type * as schema from '../schema/index.js'

export const seedEnrollment = async (
  db: NodePgDatabase<typeof schema>,
  userIds: { id: string }[],
  activityCodeIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Activity code enrollment
  //
  // An enrollment names only a learner and a code.  Which activities appear for
  // that learner comes from the associations seeded in `10_activities.ts`.
  //
  // `userIds[1]` is the learner `12_progress.ts` seeds progress for, so
  // enrolling them makes the learners/progress view non-empty.  `userIds[3]`
  // has no seeded progress and is kept so a learner-with-no-progress row stays
  // visible alongside the populated ones.
  const initialEnrollments: (typeof enrollment.$inferInsert)[] = [
    {
      user_id: userIds[1]!.id,
      activity_code_id: activityCodeIds[0]!.id,
    },
    {
      user_id: userIds[1]!.id,
      activity_code_id: activityCodeIds[1]!.id,
    },
    {
      user_id: userIds[1]!.id,
      activity_code_id: activityCodeIds[2]!.id,
    },
    {
      user_id: userIds[3]!.id,
      activity_code_id: activityCodeIds[0]!.id,
    },
    {
      user_id: userIds[3]!.id,
      activity_code_id: activityCodeIds[1]!.id,
    },
    {
      user_id: userIds[3]!.id,
      activity_code_id: activityCodeIds[2]!.id,
    },
  ]

  // Bulk enrollment: 5,000 learners in code 3, whose progress `12_progress.ts`
  // seeds against the activity code 3 is associated with.
  const generateBulkEnrollments = (
    userIds: { id: string }[],
    activityCodeIds: { id: string }[]
  ) => {
    const bulkEnrollmentData: (typeof enrollment.$inferInsert)[] = []
    for (let i = 5; i < 5005; i++) {
      bulkEnrollmentData.push({
        user_id: userIds[i]!.id,
        activity_code_id: activityCodeIds[3]!.id,
      })
    }
    return bulkEnrollmentData
  }

  const bulkEnrollmentData = generateBulkEnrollments(userIds, activityCodeIds)

  const enrollmentData = [...initialEnrollments, ...bulkEnrollmentData]

  console.log('Seed enrollment start')
  await db.insert(enrollment).values(enrollmentData)
  console.log('Seed enrollment done')
}
