import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readReleaseScripts } from './files.js'
import { RELEASE_SCRIPTS } from './manifest.gen.js'

describe('release-script manifest', () => {
  it('matches the release scripts on disk (run `pnpm schema:manifest` if not)', () => {
    const onDisk = readReleaseScripts().map(({ name, checksum }) => ({ name, checksum }))
    assert.deepEqual(RELEASE_SCRIPTS, onDisk)
  })
})
