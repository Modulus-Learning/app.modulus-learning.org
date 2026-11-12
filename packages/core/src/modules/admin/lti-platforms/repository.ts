import { eq } from 'drizzle-orm'

import { platforms } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND } from '@/lib/errors.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type LtiPlatformRecord = typeof platforms.$inferSelect
export type LtiPlatformInsert = typeof platforms.$inferInsert
export type LtiPlatformUpdate = Pick<
  LtiPlatformInsert,
  | 'name'
  | 'client_id'
  | 'authorization_endpoint'
  | 'token_endpoint'
  | 'jwks_uri'
  | 'authorization_server'
>

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
  async findPlatformById(id: string): Promise<LtiPlatformRecord | undefined> {
    return await this.db
      .get()
      .query.platforms.findFirst({ where: eq(platforms.id, id) })
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

  /**
   * Updates the editable fields of a registration. The issuer is not among
   * them, so this method cannot change it.
   */
  @method
  async updatePlatform(id: string, data: LtiPlatformUpdate): Promise<LtiPlatformRecord> {
    const [platform] = await this.db
      .get()
      .update(platforms)
      .set(data)
      .where(eq(platforms.id, id))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    if (platform == null) {
      throw ERR_NOT_FOUND({ message: 'Platform not found' }).log(this.logger)
    }

    return platform
  }
}
