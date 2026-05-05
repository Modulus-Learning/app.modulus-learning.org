'use server'

import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'

export interface GenerateCanvasConfigResult {
  ok: boolean
  config?: string
  message?: string
}

export async function generateCanvasConfig(): Promise<GenerateCanvasConfigResult> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return { ok: false, message: 'Not logged in.' }
  }

  const core = await getCoreCommands()
  const result = await core.admin.ltiPlatforms.generateCanvasConfig(adminAuth, {})

  if (result.ok) {
    return { ok: true, config: result.data.config_json }
  }

  return { ok: false, message: 'Failed to generate Canvas config.' }
}
