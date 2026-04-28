import { eq } from 'drizzle-orm'

import { platforms } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type LtiPlatformRecord = typeof platforms.$inferSelect
export type LtiPlatformInsert = typeof platforms.$inferInsert

export class LtiPlatformQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'lti-platforms')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async listLtiPlatforms(): Promise<LtiPlatformRecord[]> {
    return await this.db
      .get()
      .query.platforms.findMany() // TODO: add orderBy?
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findPlatformByIssuer(issuer: string): Promise<LtiPlatformRecord | undefined> {
    return await this.db
      .get()
      .query.platforms.findFirst({ where: eq(platforms.issuer, issuer) })
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class LtiPlatformMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'lti-platforms')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async createPlatform(data: LtiPlatformInsert): Promise<LtiPlatformRecord> {
    const [platform] = await this.db
      .get()
      .insert(platforms)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(platform, { message: 'newly created platform not found' })

    return platform
  }
}
