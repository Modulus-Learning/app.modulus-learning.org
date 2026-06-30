import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND } from '@/lib/errors.js'
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
  }

  @method
  async startAll() {
    const platforms = await this.queries.getAllPlatforms()
    for (const platform of platforms) {
      if (this.processors[platform.id] == null) {
        this.addProcessor(platform)
      } else {
        this.processors[platform.id]?.start()
      }
    }
  }

  @method
  async stopAll() {
    await Promise.allSettled(Object.values(this.processors).map((processor) => processor.stop()))
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
    const submitter = new LtiScoreSubmitter(
      platform,
      this.logger,
      this.config,
      this.mutations,
      this.accessTokenManager
    )

    const processor = new LtiScoreSubmissionProcessor(
      this.logger,
      this.config,
      submitter,
      this.mutations,
      this.queries
    )
    processor.start()

    this.processors[platform.id] = processor
  }
}
