import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  ALLOWLIST_LIST_ABILITY,
  ALLOWLIST_MANAGE_ABILITY,
  allowlistRuleListResponseSchema,
  allowlistRuleResponseSchema,
  createAllowlistRuleRequestSchema,
  createAllowlistRuleResponseSchema,
  deleteAllowlistRuleRequestSchema,
  previewAllowlistImpactRequestSchema,
  previewAllowlistImpactResponseSchema,
  updateAllowlistRuleRequestSchema,
} from './schemas.js'
import type { AdminActivityUrlAllowlistService } from './services/activity-url-allowlist.js'

/**
 * Site trust policy is administrator-only.
 *
 * Every command declares `mode: 'admin'`, so an instructor or learner access
 * token cannot reach one even if an ability string were duplicated across
 * actor domains.
 */
export class AdminActivityUrlAllowlistCommands {
  private utils: CoreUtils
  private service: AdminActivityUrlAllowlistService

  constructor(deps: { utils: CoreUtils; service: AdminActivityUrlAllowlistService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get listAllowlistRules() {
    return this.utils.createCommand({
      method: 'listAllowlistRules',
      auth: {
        mode: 'admin',
        abilities: [ALLOWLIST_LIST_ABILITY],
      },
      schemas: {
        input: z.void(),
        output: allowlistRuleListResponseSchema,
      },
      handler: this.service.listAllowlistRules.bind(this.service),
    })
  }

  @cached get previewAllowlistImpact() {
    return this.utils.createCommand({
      method: 'previewAllowlistImpact',
      auth: {
        mode: 'admin',
        abilities: [ALLOWLIST_LIST_ABILITY],
      },
      schemas: {
        input: previewAllowlistImpactRequestSchema,
        output: previewAllowlistImpactResponseSchema,
      },
      handler: this.service.previewAllowlistImpact.bind(this.service),
    })
  }

  @cached get createAllowlistRule() {
    return this.utils.createCommand({
      method: 'createAllowlistRule',
      auth: {
        mode: 'admin',
        abilities: [ALLOWLIST_MANAGE_ABILITY],
      },
      schemas: {
        input: createAllowlistRuleRequestSchema,
        output: createAllowlistRuleResponseSchema,
      },
      handler: this.service.createAllowlistRule.bind(this.service),
    })
  }

  @cached get updateAllowlistRule() {
    return this.utils.createCommand({
      method: 'updateAllowlistRule',
      auth: {
        mode: 'admin',
        abilities: [ALLOWLIST_MANAGE_ABILITY],
      },
      schemas: {
        input: updateAllowlistRuleRequestSchema,
        output: allowlistRuleResponseSchema,
      },
      handler: this.service.updateAllowlistRule.bind(this.service),
    })
  }

  @cached get deleteAllowlistRule() {
    return this.utils.createCommand({
      method: 'deleteAllowlistRule',
      auth: {
        mode: 'admin',
        abilities: [ALLOWLIST_MANAGE_ABILITY],
      },
      schemas: {
        input: deleteAllowlistRuleRequestSchema,
        output: deleteAllowlistRuleRequestSchema,
      },
      handler: this.service.deleteAllowlistRule.bind(this.service),
    })
  }
}
