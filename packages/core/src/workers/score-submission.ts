import type { StopHandle } from '@/index.js'
import type { LtiScoreSubmissionManager } from '@/modules/app/lti/score-submission/manager.js'

export function startScoreSubmissionWorker(manager: LtiScoreSubmissionManager): StopHandle {
  manager.startAll()
  return () => manager.stopAll()
}
