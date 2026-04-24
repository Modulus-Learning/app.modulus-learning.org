import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ScoreSubmissionProcessor } from '@/modules/app/lti/services/score-submission.js'

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
  config,
}: {
  processor: ScoreSubmissionProcessor
  logger: CoreLogger
  config: Config
}): () => void {
  let running = true

  const poll = async () => {
    logger.info('score submission worker started')

    while (running) {
      try {
        const result = await processor.processOne()

        switch (result.status) {
          case 'none_pending':
            await sleep(config.lti.score_submission.poll_interval_ms)
            break
          case 'claimed_by_other':
            // No delay -- just loop and check for another item
            break
          case 'success':
            // No delay -- just loop and check for another item
            break
          case 'failure':
            // No delay -- just loop and check for another item
            break
        }
      } catch (error) {
        logger.error({ err: error }, 'unexpected error in score submission worker')
        await sleep(config.lti.score_submission.error_interval_ms)
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
