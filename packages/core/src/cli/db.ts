import { bootstrapReferenceData } from '../database/bootstrap/index.js'
import {
  adoptSchema,
  initSchema,
  loadShippedScripts,
  schemaStatus,
  upgradeSchema,
} from '../database/schema-scripts/commands.js'
import { describeSchemaState } from '../database/schema-scripts/compare.js'
import { type CliOptions, connectFromOptions, drizzleFor } from './connection.js'

export const runDb = async (
  command: string | undefined,
  options: CliOptions & { through?: string }
): Promise<number> => {
  const scripts = loadShippedScripts()
  const client = await connectFromOptions(options)
  try {
    switch (command) {
      case 'status': {
        const state = await schemaStatus(client, scripts)
        console.log(describeSchemaState(state))
        return state.status === 'ok' ? 0 : 1
      }
      case 'init': {
        await initSchema(client, scripts)
        console.log(`initialised the schema at ${scripts.at(-1)?.name ?? 'baseline'}`)
        const created = await bootstrapReferenceData(drizzleFor(client))
        console.log(`created roles: ${[...created.adminRoles, ...created.roles].join(', ')}`)
        return 0
      }
      case 'upgrade': {
        const applied = await upgradeSchema(client, scripts, console.log)
        console.log(
          applied.length === 0 ? 'schema is current' : `applied ${applied.length} script(s)`
        )
        return 0
      }
      case 'adopt': {
        if (options.through == null) {
          console.error('adopt requires --through <script>')
          return 2
        }
        const adopted = await adoptSchema(client, scripts, options.through)
        console.log(`recorded ${adopted.length} script(s) as applied`)
        return 0
      }
      default:
        return 2
    }
  } finally {
    await client.end()
  }
}
