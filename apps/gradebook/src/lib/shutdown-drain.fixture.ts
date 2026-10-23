import { createRequire } from 'node:module'

import { createEntryHandler } from './entry'
import { createInFlightTracker, createShutdown, installShutdownSignals } from './shutdown'

/**
 * Child-process server for `shutdown-drain.test.node.ts`: the production entry
 * pipeline and shutdown sequence behind srvx's real Node.js adapter (the one
 * Nitro's node preset uses), with srvx's own graceful shutdown left on as in
 * production. `DRAIN_BODY` selects the response: `slow` sends a first line,
 * then 8 MiB after 300 ms; `empty` answers 204 with no body.
 */

const nitroRequire = createRequire(createRequire(import.meta.url).resolve('nitro/package.json'))
const { serve } = (await import(nitroRequire.resolve('srvx/node'))) as {
  serve: (options: {
    fetch: (request: Request) => Promise<Response>
    hostname: string
    port: number
    silent: boolean
  }) => { ready(): Promise<unknown>; url?: string }
}

export const FIRST = 'first\n'
export const BIG_BYTES = 8 * 1024 * 1024

const body = () => {
  if (process.env.DRAIN_BODY === 'empty') return new Response(null, { status: 204 })
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(FIRST))
        setTimeout(() => {
          controller.enqueue(new Uint8Array(BIG_BYTES).fill(120))
          controller.close()
        }, 300)
      },
    })
  )
}

const logger = { info() {}, warn() {}, error() {} }
const inFlight = createInFlightTracker()
const server = serve({
  fetch: createEntryHandler({ mode: 'all-in-one', logger, inFlight }, async () => body()),
  hostname: '127.0.0.1',
  port: 0,
  silent: true,
})
await server.ready()
installShutdownSignals(
  createShutdown({
    stopJobs: async () => {},
    inFlight,
    deadlineMs: 15_000,
    logger,
    exit: (code) => process.exit(code),
  })
)
process.stdout.write(`${JSON.stringify({ port: new URL(server.url as string).port })}\n`)
