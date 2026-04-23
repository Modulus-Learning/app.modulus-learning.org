import type { CoreLogger } from '@/lib/logger.js'
import type { ScoreSubmissionProcessor } from '@/modules/app/lti/services/score-submission.js'

const POLL_INTERVAL_MS = 2_000
const IDLE_INTERVAL_MS = 5_000

/**
 * Starts a polling loop that processes pending LTI score submissions.
 *
 * Each iteration calls `processOne()` on the score submission processor,
 * which finds the next eligible line item, claims it, submits the score
 * to the LTI platform, and updates the line item state.
 *
 * The loop polls at POLL_INTERVAL_MS when there is work to do, and backs
 * off to IDLE_INTERVAL_MS when no pending submissions are found.
 *
 * Returns a function that stops the worker loop.
 */
export function startScoreSubmissionWorker({
  processor,
  logger,
}: {
  processor: ScoreSubmissionProcessor
  logger: CoreLogger
}): () => void {
  let running = true

  const poll = async () => {
    logger.info('score submission worker started')

    while (running) {
      try {
        const result = await processor.processOne()

        switch (result.status) {
          case 'none_pending':
            await sleep(IDLE_INTERVAL_MS)
            break
          case 'claimed_by_other':
            // Another worker got it; try again immediately
            break
          case 'success':
            // More work may be pending; continue with a short delay
            await sleep(POLL_INTERVAL_MS)
            break
          case 'failure':
            // The failed item is now in backoff; continue looking for others
            await sleep(POLL_INTERVAL_MS)
            break
        }
      } catch (error) {
        logger.error({ err: error }, 'unexpected error in score submission worker')
        await sleep(IDLE_INTERVAL_MS)
      }
    }

    logger.info('score submission worker stopped')
  }

  poll()

  return () => {
    running = false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
