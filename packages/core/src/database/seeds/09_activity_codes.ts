import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { v7 as uuidv7 } from 'uuid'

import { activityCodes } from '../schema/source/activity-codes.js'
import type * as schema from '../schema/index.js'

export const seedActivityCodes = async (
  db: NodePgDatabase<typeof schema>,
  userIds: { id: string }[]
) => {
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Activity Code data
  const activityCodeData: (typeof activityCodes.$inferInsert)[] = [
    {
      id: uuidv7(),
      user_id: userIds[0]!.id,
      code: 'eager-jellyfish',
      private_code: '98fj98jloawifj',
    },
    {
      id: uuidv7(),
      user_id: userIds[0]!.id,
      code: 'successive-lamprey',
      private_code: 'fejwaoifoeweif',
    },
    {
      id: uuidv7(),
      user_id: userIds[2]!.id,
      code: 'elderly-mockingbird',
      private_code: 'ofjwiejf23fa9w',
    },
    {
      id: uuidv7(),
      user_id: userIds[3]!.id,
      code: 'tasteless-whippet',
      private_code: 'f389fj98f23382',
    },
  ]

  console.log('Seed activity_codes start')
  const activityCodeIds = await db
    .insert(activityCodes)
    .values(activityCodeData)
    .returning({ id: activityCodes.id })
  console.log('Seed activity_codes done')

  return activityCodeIds
}
