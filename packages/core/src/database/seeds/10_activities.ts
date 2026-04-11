import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { activities } from '../schema/source/activities.js'
import type * as schema from '../schema/index.js'

export const seedActivities = async (db: NodePgDatabase<typeof schema>) => {
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

  return activityIds
}
