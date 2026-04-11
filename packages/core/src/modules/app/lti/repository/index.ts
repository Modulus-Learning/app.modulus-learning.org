import { and, eq } from 'drizzle-orm'

import { launches, lineitems, nonces, platforms } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type LineItemRecord = typeof lineitems.$inferSelect
export type LineItemInsert = typeof lineitems.$inferInsert
export type NonceRecord = typeof nonces.$inferSelect
export type NonceInsert = typeof nonces.$inferInsert
export type PlatformRecord = typeof platforms.$inferSelect
export type PlatformInsert = typeof platforms.$inferInsert
export type LaunchRecord = typeof launches.$inferSelect
export type LaunchInsert = typeof launches.$inferInsert

export type LineItemQueryOptions = {
  user_id: string
  activity_id: string
  lineitem_url: string
}

export class LtiQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'lti')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async findLaunch(launchId: string): Promise<LaunchRecord | undefined> {
    return await this.db
      .get()
      .query.launches.findFirst({ where: eq(launches.id, launchId) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findNonce(nonce: string): Promise<NonceRecord | undefined> {
    return await this.db
      .get()
      .query.nonces.findFirst({ where: eq(nonces.nonce, nonce) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findPlatformByIssuer(issuer: string): Promise<PlatformRecord | undefined> {
    return await this.db
      .get()
      .query.platforms.findFirst({ where: eq(platforms.issuer, issuer) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findLineItem({
    user_id,
    activity_id,
    lineitem_url,
  }: LineItemQueryOptions): Promise<LineItemRecord | undefined> {
    return await this.db
      .get()
      .query.lineitems.findFirst({
        where: and(
          eq(lineitems.user_id, user_id),
          eq(lineitems.activity_id, activity_id),
          eq(lineitems.lineitem_url, lineitem_url)
        ),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getLineItems(user_id: string, activity_id: string): Promise<LineItemRecord[]> {
    return await this.db
      .get()
      .query.lineitems.findMany({
        where: and(eq(lineitems.user_id, user_id), eq(lineitems.activity_id, activity_id)),
      })
      .catch(this.utils.wrapDbErrorNew())
  }
}

export class LtiMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'lti')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async insertLaunch(launch: LaunchInsert): Promise<void> {
    await this.db.get().insert(launches).values(launch).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async insertNonce(nonce: string): Promise<void> {
    await this.db.get().insert(nonces).values({ nonce }).catch(this.utils.wrapDbErrorNew())
  }

  @method
  async markNonceUsed(nonce: string): Promise<void> {
    await this.db
      .get()
      .update(nonces)
      .set({ used: true })
      .where(eq(nonces.nonce, nonce))
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async insertLineItem(lineItem: LineItemInsert): Promise<LineItemRecord> {
    const [result] = await this.db
      .get()
      .insert(lineitems)
      .values(lineItem)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(result, { message: 'newly created line item is null' })

    return result
  }

  @method
  async updateLineItem(id: string, data: Omit<Partial<LineItemRecord>, 'id'>): Promise<void> {
    await this.db
      .get()
      .update(lineitems)
      .set(data)
      .where(eq(lineitems.id, id))
      .catch(this.utils.wrapDbErrorNew())
  }
}
