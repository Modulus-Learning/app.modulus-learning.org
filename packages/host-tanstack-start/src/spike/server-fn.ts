import { createMiddleware, createServerFn } from '@tanstack/react-start'

// Stands in for the surface-gate middleware: every packaged server function's
// first middleware is its gate, as in apps/gradebook/src/lib/server-fn.ts.
const spikeGateMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  return next({ context: { gate: 'spike' } })
})

export const greetServerFn = createServerFn({ method: 'POST' })
  .middleware([spikeGateMiddleware])
  .validator((name: string) => name)
  .handler(async ({ data, context }) => {
    const { greet } = await import('./greeting.server.js')
    return `${greet(data)} via ${context.gate}`
  })
