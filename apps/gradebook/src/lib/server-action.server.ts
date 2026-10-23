import { ServerRedirect } from './server-request'
import type { ActionOutcome } from './server-action'

/** Runs a form action's logic; a `redirect()` it throws becomes a redirect outcome. */
export const runAction = async <T>(action: () => Promise<T>): Promise<ActionOutcome<T>> => {
  try {
    return { kind: 'result', value: await action() }
  } catch (error) {
    if (error instanceof ServerRedirect) return { kind: 'redirect', url: error.url }
    throw error
  }
}
