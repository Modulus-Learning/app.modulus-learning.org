/**
 * Pure comparison between the release scripts a build ships and the scripts a
 * database records as applied. No I/O, so the boot check and the CLI share it.
 */

export type ScriptRecord = {
  name: string
  checksum: string
}

export type SchemaState =
  | { status: 'ok' }
  | { status: 'no-ledger'; hasModulusTables: boolean }
  | { status: 'mismatch'; scripts: string[] }
  | { status: 'pending'; scripts: string[] }
  | { status: 'newer'; scripts: string[] }

/** Release script file names: `YYYY-MM-DD-NNN-<slug>.sql`. */
export const RELEASE_SCRIPT_PATTERN = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+\.sql$/

export const compareLedger = (
  shipped: readonly ScriptRecord[],
  applied: readonly ScriptRecord[] | null,
  hasModulusTables = false
): SchemaState => {
  if (applied == null) return { status: 'no-ledger', hasModulusTables }

  const shippedByName = new Map(shipped.map((script) => [script.name, script.checksum]))
  const appliedNames = new Set(applied.map((script) => script.name))

  const mismatched = applied
    .filter((script) => shippedByName.has(script.name))
    .filter((script) => shippedByName.get(script.name) !== script.checksum)
    .map((script) => script.name)
  if (mismatched.length > 0) return { status: 'mismatch', scripts: mismatched }

  const pending = shipped.filter((script) => !appliedNames.has(script.name)).map((s) => s.name)
  if (pending.length > 0) return { status: 'pending', scripts: pending }

  const newer = applied.filter((script) => !shippedByName.has(script.name)).map((s) => s.name)
  if (newer.length > 0) return { status: 'newer', scripts: newer }

  return { status: 'ok' }
}

/** One line describing a state, for logs and the CLI. */
export const describeSchemaState = (state: SchemaState): string => {
  switch (state.status) {
    case 'ok':
      return 'schema is current'
    case 'no-ledger':
      return state.hasModulusTables
        ? 'database has Modulus tables but no script ledger; run `modulus db adopt --through <script>`'
        : 'database has no Modulus schema; run `modulus db init`'
    case 'mismatch':
      return `applied scripts differ from the shipped scripts: ${state.scripts.join(', ')}`
    case 'pending':
      return `release scripts not yet applied: ${state.scripts.join(', ')}; run \`modulus db upgrade\``
    case 'newer':
      return `database has scripts this build does not know: ${state.scripts.join(', ')}`
  }
}
