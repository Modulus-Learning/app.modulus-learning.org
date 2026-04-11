import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { progress } from '../schema/source/progress.js'
import type * as schema from '../schema/index.js'

export const seedProgress = async (
  db: NodePgDatabase<typeof schema>,
  userIds: { id: string }[],
  activityIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Activity progress
  const progressData: (typeof progress.$inferInsert)[] = [
    {
      user_id: userIds[1]!.id,
      activity_id: activityIds[0]!.id,
      progress: 1.0,
    },
    {
      user_id: userIds[1]!.id,
      activity_id: activityIds[1]!.id,
      progress: 0.33,
    },
    {
      user_id: userIds[1]!.id,
      activity_id: activityIds[2]!.id,
      progress: 0.0,
    },
  ]

  // Bulk progress
  const generateBulkProgress = (userIds: { id: string }[], activityIds: { id: string }[]) => {
    const bulkProgressData: (typeof progress.$inferInsert)[] = []
    for (let i = 5; i < 5005; i++) {
      bulkProgressData.push({
        user_id: userIds[i]!.id, // Start at position 5
        activity_id: activityIds[1]!.id,
        progress: [0.33, 0.66, 1.0][Math.floor(Math.random() * 3)]!, // Random value from 0.33, 0.66, 1.0
      })
    }
    return bulkProgressData
  }

  const bulkProgressData = generateBulkProgress(userIds, activityIds)

  console.log('Seed activity_user_progress start')
  await db.insert(progress).values([...progressData, ...bulkProgressData]) // Combine initial and bulk data
  console.log('Seed activity_user_progress done')
}
