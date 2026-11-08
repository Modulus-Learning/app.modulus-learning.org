import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// These fixtures use local Git remotes and mocked package managers. No real
// registry, credentials, GitHub access, or repository commits are involved.
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = '1.2.3'
const names = ['@modulus-learning/lti', '@modulus-learning/core']

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'modulus-release-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'repo')
  const remote = join(root, 'remote.git')
  const bin = join(root, 'bin')
  mkdirSync(repo)
  mkdirSync(bin)
  const registry = join(root, 'registry.json')
  const calls = join(root, 'calls.jsonl')
  writeFileSync(registry, '{}')
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Release test',
    GIT_AUTHOR_EMAIL: 'release@example.invalid',
    GIT_COMMITTER_NAME: 'Release test',
    GIT_COMMITTER_EMAIL: 'release@example.invalid',
    MOCK_REGISTRY: registry,
    MOCK_CALLS: calls,
    PATH: `${bin}:${process.env.PATH}`,
  }
  function run(command, args, extraEnv = {}) {
    return spawnSync(command, args, { cwd: repo, env: { ...env, ...extraEnv }, encoding: 'utf8' })
  }
  function git(...args) {
    const result = run('git', args)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  function write(path, content) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  function commit(subject) {
    git('add', '.')
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', 'commit', '-qm', subject)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '--initial-branch=develop')
  git('init', '-q', '--bare', remote)
  git('remote', 'add', 'origin', remote)
  write('.changeset/config.json', JSON.stringify({ fixed: [names] }))
  write('VERSION', `${version}\n`)
  for (const name of names) {
    const pkg = name.split('/')[1]
    write(
      `packages/${pkg}/package.json`,
      JSON.stringify({
        name,
        version,
        dependencies: pkg === 'core' ? { [names[0]]: `^${version}` } : {},
      })
    )
    write(`packages/${pkg}/dist/index.js`, 'export const value = 1\n')
  }
  write('packages/core/src/database/sql/20260101_initial.sql', 'SELECT 1;\n')
  const previous = commit('chore: prepared fixture')
  git('tag', 'previous-release')
  write('release-marker', 'release\n')
  const anchor = commit(`chore(release): ${version}`)
  git('push', '-q', 'origin', 'develop')

  const mock = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { execFileSync } = require('node:child_process')
const command = path.basename(process.argv[1]), args = process.argv.slice(2)
fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify({ command, args }) + '\\n')
const registry = JSON.parse(fs.readFileSync(process.env.MOCK_REGISTRY, 'utf8'))
if (command === 'npm' && args[0] === 'view') {
  if (registry[args[1]]) console.log(registry[args[1]])
} else if (command === 'npm' && args[0] === 'publish') {
  const pkg = JSON.parse(execFileSync('tar', ['-xzOf', args[1], 'package/package.json'], { encoding: 'utf8' }))
  if (process.env.MOCK_FAIL_PACKAGE === pkg.name) process.exit(1)
  registry[pkg.name + '@' + pkg.version] = pkg.version
  fs.writeFileSync(process.env.MOCK_REGISTRY, JSON.stringify(registry))
} else if (command === 'pnpm' && args[0] === 'pack') {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'modulus-pack-'))
  try {
    fs.mkdirSync(path.join(staging, 'package', 'dist'), { recursive: true })
    fs.copyFileSync('package.json', path.join(staging, 'package', 'package.json'))
    fs.writeFileSync(path.join(staging, 'package', 'dist', 'index.js'), 'export {}')
    execFileSync('tar', ['-czf', 'package.tgz', '-C', staging, 'package'])
  } finally { fs.rmSync(staging, { recursive: true, force: true }) }
} else {
  console.error('Unexpected mocked package-manager call', command, args)
  process.exit(2)
}
`
  for (const command of ['npm', 'pnpm']) {
    writeFileSync(join(bin, command), mock)
    chmodSync(join(bin, command), 0o755)
  }
  return {
    repo,
    remote,
    anchor,
    previous,
    git,
    write,
    commit,
    calls: () => {
      try {
        return readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      } catch (error) {
        if (error.code === 'ENOENT') return []
        throw error
      }
    },
    publish: (args = [], extraEnv = {}) =>
      run(
        'bash',
        [join(sourceRoot, 'publish-packages.sh'), '--no-build', '--yes', ...args],
        extraEnv
      ),
    sql: () => run('bash', [join(sourceRoot, 'scripts/check-release-sql.sh'), 'previous-release']),
    markPublished: () =>
      writeFileSync(
        registry,
        JSON.stringify(Object.fromEntries(names.map((name) => [`${name}@${version}`, version])))
      ),
  }
}

function rejectedBeforeRegistry(f, result, message) {
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stdout + result.stderr, message)
  assert.deepEqual(f.calls(), [], 'must reject before registry access or packing')
}

test('publication requires an explicit release anchor', (t) => {
  const f = fixture(t)
  rejectedBeforeRegistry(f, f.publish(), /requires --anchor/)
})

test('a later checkout cannot resume an older release', (t) => {
  const f = fixture(t)
  f.write('later', 'later code')
  f.commit('fix: changed code after release')
  rejectedBeforeRegistry(f, f.publish(['--anchor', f.anchor]), /HEAD is not/)
})

test('dirty release trees and mismatched root versions cannot publish', async (t) => {
  await t.test('dirty tree', (t) => {
    const f = fixture(t)
    f.write('uncommitted', 'change')
    rejectedBeforeRegistry(f, f.publish(['--anchor', f.anchor]), /must be clean/)
  })
  await t.test('root version', (t) => {
    const f = fixture(t)
    f.write('VERSION', '1.2.2\n')
    const anchor = f.commit(`chore(release): ${version}`)
    rejectedBeforeRegistry(f, f.publish(['--anchor', anchor]), /root VERSION/)
  })
})

test('a conflicting tag on a later package stops the entire publish', (t) => {
  const f = fixture(t)
  f.git('tag', `${names[1]}@${version}`, f.previous)
  rejectedBeforeRegistry(f, f.publish(['--anchor', f.anchor]), /local tag .* does not point/)
})

test('remote package and umbrella tag conflicts are checked before publishing', async (t) => {
  for (const tag of [`${names[1]}@${version}`, `v${version}`]) {
    await t.test(tag, (t) => {
      const f = fixture(t)
      f.git('tag', '-a', tag, '-m', 'wrong release', f.previous)
      f.git('push', '-q', 'origin', tag)
      f.git('tag', '-d', tag)
      rejectedBeforeRegistry(f, f.publish(['--anchor', f.anchor]), /remote tag .* does not point/)
    })
  }
})

test('remote lookup failure stops before publishing', (t) => {
  const f = fixture(t)
  f.git('remote', 'set-url', 'origin', join(f.repo, 'missing.git'))
  rejectedBeforeRegistry(f, f.publish(['--anchor', f.anchor]), /cannot verify remote/)
})

test('resume preserves annotated remote tags and completes missing tags', (t) => {
  const f = fixture(t)
  const tag = `${names[0]}@${version}`
  f.git('tag', '-a', tag, '-m', 'release', f.anchor)
  const tagObject = f.git('rev-parse', tag)
  f.git('push', '-q', 'origin', tag)
  f.git('tag', '-d', tag)
  f.markPublished()
  const result = f.publish(['--anchor', f.anchor])
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(f.git('rev-parse', tag), tagObject)
  for (const name of names) {
    assert.equal(f.git('rev-parse', `${name}@${version}^{commit}`), f.anchor)
    assert.match(
      f.git('ls-remote', '--tags', 'origin', `refs/tags/${name}@${version}*`),
      new RegExp(f.anchor)
    )
  }
  assert.equal(f.calls().filter((c) => c.args[0] === 'publish').length, 0)
})

test('partial publication resumes at the same version without republishing dependencies', (t) => {
  const f = fixture(t)
  const first = f.publish(['--anchor', f.anchor], { MOCK_FAIL_PACKAGE: names[1] })
  assert.notEqual(first.status, 0)
  assert.match(first.stdout + first.stderr, /failed on @modulus-learning\/core/)
  assert.equal(f.git('rev-parse', `${names[0]}@${version}^{commit}`), f.anchor)
  const second = f.publish(['--anchor', f.anchor])
  assert.equal(second.status, 0, second.stdout + second.stderr)
  const publishes = f.calls().filter((c) => c.args[0] === 'publish')
  assert.equal(
    publishes.length,
    3,
    'one dependency publish, one failed core publish, one core retry'
  )
  for (const name of names)
    assert.equal(f.git('rev-parse', `${name}@${version}^{commit}`), f.anchor)
})

test('dry-run permits an uncommitted tree and never publishes or tags', (t) => {
  const f = fixture(t)
  f.write('uncommitted', 'change')
  const result = f.publish(['--dry-run'])
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(f.calls().filter((c) => c.args[0] === 'publish').length, 0)
  assert.equal(f.git('tag', '--list', '@modulus-learning/*'), '')
  assert.equal(f.git('ls-remote', '--tags', 'origin'), '')
})

test('SQL gate allows new scripts but rejects modified, removed, or renamed released scripts', async (t) => {
  for (const change of ['add', 'modify', 'delete', 'rename']) {
    await t.test(change, (t) => {
      const f = fixture(t)
      const old = 'packages/core/src/database/sql/20260101_initial.sql'
      const next = 'packages/core/src/database/sql/20260102_next.sql'
      if (change === 'add') f.write(next, 'SELECT 2;\n')
      if (change === 'modify') f.write(old, 'SELECT 2;\n')
      if (change === 'delete') rmSync(join(f.repo, old))
      if (change === 'rename') renameSync(join(f.repo, old), join(f.repo, next))
      f.commit(`test: ${change} migration`)
      if (change === 'rename') {
        assert.match(f.git('diff', '--name-status', '-M', 'previous-release'), /^R100\s/m)
      }
      const result = f.sql()
      assert.equal(result.status, change === 'add' ? 0 : 1, result.stdout + result.stderr)
    })
  }
})
