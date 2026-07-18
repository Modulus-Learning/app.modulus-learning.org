// Small async coordination helpers for the integration tests, where several
// real database connections have to be interleaved deterministically.

export type Deferred<T = void> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

/** A promise with externally-callable `resolve`/`reject` -- a coordination barrier. */
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Polls `predicate` until it returns true or `timeoutMs` elapses (then throws).
 * Used to wait on a state another concurrent transaction is expected to reach.
 */
export async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 2000, intervalMs = 10 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor: condition not met within timeout')
    }
    await delay(intervalMs)
  }
}
