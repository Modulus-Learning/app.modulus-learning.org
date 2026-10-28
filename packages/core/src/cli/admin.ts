import { createInterface } from 'node:readline'

import { passwordSchema } from '@infonomic/schemas'

import { bootstrapReferenceData, createAdministrator } from '../database/bootstrap/index.js'
import { type CliOptions, connectFromOptions, drizzleFor } from './connection.js'

/** Read a password from piped stdin, or prompt for it without echoing. */
const readPassword = async (fromStdin: boolean): Promise<string> => {
  if (fromStdin) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '')
  }
  if (!process.stdin.isTTY) throw new Error('no terminal to prompt on; use --password-stdin')
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const ask = (prompt: string) =>
    new Promise<string>((resolve) => {
      process.stdout.write(prompt)
      // Suppress echo of what is typed after the prompt.
      const output = rl as unknown as { _writeToOutput: (text: string) => void }
      output._writeToOutput = () => {}
      rl.question('', (answer) => {
        process.stdout.write('\n')
        resolve(answer)
      })
    })
  try {
    const password = await ask('Password: ')
    if ((await ask('Confirm password: ')) !== password) throw new Error('passwords do not match')
    return password
  } finally {
    rl.close()
  }
}

export const runBootstrap = async (options: CliOptions): Promise<number> => {
  const client = await connectFromOptions(options)
  try {
    const created = await bootstrapReferenceData(drizzleFor(client))
    const names = [...created.adminRoles, ...created.roles]
    console.log(
      names.length === 0 ? 'reference roles already present' : `created roles: ${names.join(', ')}`
    )
    return 0
  } finally {
    await client.end()
  }
}

export const runAdmin = async (
  command: string | undefined,
  options: CliOptions & {
    email?: string
    'given-name'?: string
    'family-name'?: string
    'password-stdin'?: boolean
  }
): Promise<number> => {
  if (command !== 'create') return 2
  if (options.email == null) {
    console.error('admin create requires --email <address>')
    return 2
  }
  const parsed = passwordSchema.safeParse(await readPassword(options['password-stdin'] ?? false))
  if (!parsed.success) {
    console.error(
      `password rejected: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
    )
    return 1
  }
  const password = parsed.data
  const client = await connectFromOptions(options)
  try {
    const db = drizzleFor(client)
    await bootstrapReferenceData(db)
    await createAdministrator(db, {
      email: options.email,
      password,
      given_name: options['given-name'],
      family_name: options['family-name'],
    })
    console.log(`created administrator ${options.email} with the Manager role`)
    return 0
  } finally {
    await client.end()
  }
}
