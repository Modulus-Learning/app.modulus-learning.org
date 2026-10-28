import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

// The committed `.env` must only ever hold public values (spec: Task 4 env
// split). Secrets belong in the gitignored `.env.local`.
const SECRET_KEY =
  /SECRET|PRIVATE|PASSWORD|TOKEN|CONNECTION_STRING|CLIENT_SECRET|SMTP_USER|ACCESS_KEY/i

const keysOf = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => line.slice(0, line.indexOf('=')))

describe('committed .env', () => {
  const keys = keysOf(resolve(__dirname, '../../.env'))

  test('contains no secret-shaped key', () => {
    expect(keys.filter((key) => SECRET_KEY.test(key))).toEqual([])
  })

  test('contains only VITE_* keys', () => {
    expect(keys.filter((key) => !key.startsWith('VITE_'))).toEqual([])
  })
})
