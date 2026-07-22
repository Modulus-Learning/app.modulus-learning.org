import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND } from '@/lib/errors.js'
import { HttpLtiAgsClient } from './ags-client.js'
import { LoggingIncidentSink } from './incident-sink.js'
import { LtiIncidentNotifier } from './notifier.js'
import { LtiScoreSubmissionProcessor } from './processor.js'
import { LtiScoreSubmitter } from './submitter.js'
import type { Config } from '@/config.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccessTokenManager } from '../services/access-tokens.js'
import type {
  LtiScoreSubmissionMutations,
  LtiScoreSubmissionQueries,
  PlatformRecord,
} from './repository.js'

export class LtiScoreSubmissionManager extends BaseService {
  private config: Config
  private queries: LtiScoreSubmissionQueries
  private mutations: LtiScoreSubmissionMutations
  private accessTokenManager: AccessTokenManager
  private tx: TXManager

  private processors: Record<string, LtiScoreSubmissionProcessor>
  private notifier: LtiIncidentNotifier

  // Reconcile loop lifecycle (mirrors the notifier's desired-vs-actual idiom).
  private desiredRunning = false
  private runPromise?: Promise<void>
  private wakeResolve?: () => void

  constructor(deps: {
    logger: CoreLogger
    config: Config
    tx: TXManager
    scoreSubmissionQueries: LtiScoreSubmissionQueries
    scoreSubmissionMutations: LtiScoreSubmissionMutations
    accessTokenManager: AccessTokenManager
  }) {
    super(deps.logger, 'app', 'lti')
    this.config = deps.config
    this.tx = deps.tx
    this.queries = deps.scoreSubmissionQueries
    this.mutations = deps.scoreSubmissionMutations
    this.accessTokenManager = deps.accessTokenManager

    this.processors = {}
    this.notifier = new LtiIncidentNotifier(
      this.logger,
      this.config,
      this.queries,
      this.mutations,
      new LoggingIncidentSink(this.logger)
    )
  }

  /**
   * Starts the notifier and the platform reconcile loop. Idempotent. The loop
   * periodically diffs the `platforms` table against the running processors —
   * starting one for a newly-registered platform and stopping one whose platform
   * is gone — so onboarding needs no redeploy. Returns immediately; the first
   * reconcile runs on the loop.
   */
  @method
  start(): void {
    if (this.desiredRunning) {
      return
    }
    this.desiredRunning = true
    this.notifier.start()
    this.runPromise = this.runReconcileLoop()
  }

  /** Stops the reconcile loop, then drains every processor and the notifier. */
  @method
  async stop(): Promise<void> {
    this.desiredRunning = false
    this.wake()
    await this.runPromise

    await Promise.allSettled([
      ...Object.values(this.processors).map((processor) => processor.stop()),
      this.notifier.stop(),
    ])
  }

  private async runReconcileLoop(): Promise<void> {
    this.logger.info('score submission platform reconcile loop started')
    const intervalMs = this.config.lti.score_submission.platform_reconcile_interval_seconds * 1000

    while (this.desiredRunning) {
      await this.reconcile().catch((err) =>
        this.logger.warn({ err }, 'score submission platform reconcile failed')
      )
      if (!this.desiredRunning) {
        break
      }
      await this.sleep(intervalMs)
    }

    this.runPromise = undefined
    this.logger.info('score submission platform reconcile loop stopped')
  }

  /**
   * Diffs the `platforms` table against the running processors: starts one for
   * each new platform, and stops+drops one whose platform has disappeared.
   * Existing processors are left alone — each self-heals a crashed run loop via
   * its own `ensureRunning`. If several instances run this loop, each reconciles
   * independently; per-item work stays safe across them via lease fencing.
   */
  private async reconcile(): Promise<void> {
    const platforms = await this.queries.getAllPlatforms()
    const live = new Set(platforms.map((platform) => platform.id))

    for (const platform of platforms) {
      if (this.processors[platform.id] == null) {
        this.addProcessor(platform)
      }
    }

    for (const id of Object.keys(this.processors)) {
      if (!live.has(id)) {
        // Fire-and-forget the drain; full shutdown is handled by stop().
        this.stopPlatform(id)
        delete this.processors[id]
      }
    }
  }

  @method
  async startPlatform(platform_id: string) {
    if (this.processors[platform_id] == null) {
      const platform = await this.queries.getPlatformById(platform_id)
      if (!platform) {
        throw ERR_NOT_FOUND({ message: 'LTI platform not found' })
      }

      this.addProcessor(platform)
    } else {
      this.processors[platform_id]?.start()
    }
  }

  @method
  stopPlatform(platform_id: string) {
    this.processors[platform_id]?.stop()
  }

  private addProcessor(platform: PlatformRecord) {
    const agsClient = new HttpLtiAgsClient({
      logger: this.logger,
      config: this.config,
      platform,
      accessTokenManager: this.accessTokenManager,
    })

    const submitter = new LtiScoreSubmitter({
      logger: this.logger,
      config: this.config,
      scoreSubmissionMutations: this.mutations,
      agsClient,
    })

    const processor = new LtiScoreSubmissionProcessor({
      logger: this.logger,
      config: this.config,
      submitter,
      mutations: this.mutations,
      queries: this.queries,
    })
    processor.start()

    this.processors[platform.id] = processor
  }

  /** Interruptible sleep so `stop()` returns promptly. */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeResolve = undefined
        resolve()
      }, ms)
      this.wakeResolve = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  private wake(): void {
    const resolve = this.wakeResolve
    this.wakeResolve = undefined
    resolve?.()
  }
}
