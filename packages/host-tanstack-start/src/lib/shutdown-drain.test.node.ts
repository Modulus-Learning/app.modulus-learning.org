import { type ChildProcess, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

// Review R6: exit must wait for the HTTP response to be fully written, not just
// for the handler or the body stream to finish. A real child process serves
// through srvx's Node adapter with the production entry pipeline and shutdown
// sequence; the client stalls reading to apply backpressure while SIGTERM
// arrives. The whole payload must arrive and the process must exit 0.

const require = createRequire(import.meta.url)
const tsx = require.resolve('tsx/cli')
const fixture = fileURLToPath(new URL('./shutdown-drain.fixture.ts', import.meta.url))
const tsconfig = fileURLToPath(new URL('../../tsconfig.json', import.meta.url))

const FIRST = 'first\n'
const BIG_BYTES = 8 * 1024 * 1024

let child: ChildProcess | undefined

afterEach(() => {
  if (child?.exitCode == null) child?.kill('SIGKILL')
})

const start = async (drainBody: 'slow' | 'empty') => {
  child = spawn(process.execPath, [tsx, '--tsconfig', tsconfig, fixture], {
    env: { ...process.env, DRAIN_BODY: drainBody },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = new Promise<number | null>((resolve) =>
    child?.once('exit', (code) => resolve(code))
  )
  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })
  const port = await new Promise<string>((resolve, reject) => {
    let out = ''
    child?.stdout?.on('data', (chunk) => {
      out += chunk
      const line = out.split('\n').find((l) => l.startsWith('{'))
      if (line) resolve(JSON.parse(line).port)
    })
    child?.once('exit', () => reject(new Error(stderr || 'fixture exited before listening')))
  })
  return { port, exited, kill: (signal: NodeJS.Signals) => child?.kill(signal) }
}

describe('shutdown drains the HTTP response (real transport)', () => {
  test.each([1, 2, 3])(
    'attempt %i: a backpressured 8 MiB body arrives whole before a clean exit',
    async () => {
      const server = await start('slow')
      const response = await fetch(`http://127.0.0.1:${server.port}/slow`)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let received = decoder.decode((await reader?.read())?.value)

      server.kill('SIGTERM')
      // Stall the client so the server's writes back up behind the socket.
      await new Promise((resolve) => setTimeout(resolve, 700))
      for (;;) {
        const chunk = await reader?.read()
        if (chunk == null || chunk.done) break
        received += decoder.decode(chunk.value, { stream: true })
      }

      expect(received.length).toBe(FIRST.length + BIG_BYTES)
      expect(await server.exited).toBe(0)
    },
    30_000
  )

  test('a bodyless response is drained too, then a clean exit', async () => {
    const server = await start('empty')
    const response = await fetch(`http://127.0.0.1:${server.port}/empty`)
    expect(response.status).toBe(204)
    server.kill('SIGTERM')
    expect(await server.exited).toBe(0)
  }, 30_000)
})
