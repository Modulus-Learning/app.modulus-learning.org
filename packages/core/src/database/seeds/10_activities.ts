import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { activities } from '../schema/source/activities.js'
import { activityActivityCode } from '../schema/source/activity-activity-code.js'
import type * as schema from '../schema/index.js'

export const seedActivities = async (
  db: NodePgDatabase<typeof schema>,
  activityCodeIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Activity data
  const activityData: (typeof activities.$inferInsert)[] = [
    {
      id: uuidv7(),
      url: 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/breakGround',
      name: 'Stars and functions',
    },
    {
      id: uuidv7(),
      url: 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/digInWhatIsALimit',
      name: 'What is a limit?',
    },
    {
      id: uuidv7(),
      url: 'https://ximera.osu.edu/mooculus/calculus1/whatIsALimit/digInContinuity',
      name: 'Continuity',
    },
    {
      id: uuidv7(),
      url: 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/breakGround',
      name: 'Equal or not?',
    },
    {
      id: uuidv7(),
      url: 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/digInLimitLaws',
      name: 'The limit laws',
    },
    {
      id: uuidv7(),
      url: 'https://ximera.osu.edu/mooculus/calculus1/limitLaws/digInTheSqueezeTheorem',
      name: 'The squeeze theorem',
    },
  ]

  console.log('Seed activities start')
  const activityIds = await db
    .insert(activities)
    .values(activityData)
    .returning({ id: activities.id })
  console.log('Seed activities done')

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Activity / activity code associations
  //
  // Reporting is the intersection of code enrollment and this relation, so a
  // code with enrolled learners but no associated activity reports nothing.
  // Every code that receives seeded enrollment in `11_enrollment.ts` therefore
  // gets at least one activity here.
  const activityActivityCodeData: (typeof activityActivityCode.$inferInsert)[] = [
    // Codes 0-2 each take their matching activity.
    { activity_code_id: activityCodeIds[0]!.id, activity_id: activityIds[0]!.id },
    { activity_code_id: activityCodeIds[1]!.id, activity_id: activityIds[1]!.id },
    { activity_code_id: activityCodeIds[2]!.id, activity_id: activityIds[2]!.id },

    // A second activity under code 0, so the learner x activity fan-out is
    // visible in development.  `12_progress.ts` seeds no progress for this one,
    // which also exercises the null-progress cell for a learner who does have
    // progress elsewhere in the same code.
    { activity_code_id: activityCodeIds[0]!.id, activity_id: activityIds[3]!.id },

    // The 5,000-learner bulk cohort enrolls in code 3, and `12_progress.ts`
    // seeds its progress against activity 1, so code 3 must carry that activity
    // for the cohort to be reportable.
    { activity_code_id: activityCodeIds[3]!.id, activity_id: activityIds[1]!.id },
  ]

  console.log('Seed activity_activity_code start')
  await db.insert(activityActivityCode).values(activityActivityCodeData)
  console.log('Seed activity_activity_code done')

  return activityIds
}
