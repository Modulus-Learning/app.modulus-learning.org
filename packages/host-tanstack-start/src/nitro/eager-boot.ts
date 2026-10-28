import { definePlugin } from 'nitro'

/**
 * Nitro runtime plugin: boots the app at process start instead of on the
 * first request.
 *
 * Nitro loads the TanStack Start renderer — and with it `src/server.ts`, which
 * validates configuration, logs the boot line, starts background jobs and
 * installs the shutdown handlers — lazily, on the first request. Left alone,
 * an admin instance would run no score submissions until something requested
 * a page, and a misconfigured instance would start and fail on its first
 * request. (Next did this work in `instrumentation.ts` at startup.)
 *
 * The plugin sends one internal request through the app handler once the app
 * is ready, which evaluates `src/server.ts` in its one and only module
 * instance. In production a failed boot exits the process, so the supervisor
 * restarts it rather than serving errors.
 */
export default definePlugin((nitroApp) => {
  setImmediate(async () => {
    let failure: unknown
    try {
      const response = await nitroApp.fetch(new Request('http://localhost/routes/elb-status'))
      // Release the body: the entry pipeline counts a request in flight until
      // its body is consumed, and shutdown waits for that count to reach zero.
      await response.body?.cancel()
      if (!response.ok) failure = new Error(`boot request answered ${response.status}`)
    } catch (error) {
      failure = error
    }
    if (failure == null) return
    console.error('gradebook failed to boot:', failure)
    if (process.env.NODE_ENV === 'production') process.exit(1)
  })
})
