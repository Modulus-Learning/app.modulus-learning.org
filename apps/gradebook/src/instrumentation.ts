import { getServerConfig } from '@/config'
import { getLogger } from '@/lib/logger'

export async function register() {
  // Only run background jobs in the Node.js runtime, not edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const config = getServerConfig()
  if (config.jobQueue.enabled) {
    const logger = getLogger()
    logger.info('Starting background jobs')

    // Nextjs complains at build-time if we import this at top-level.
    const { getCoreInstance } = await import('@/core-adapter')
    const coreInstance = await getCoreInstance()
    coreInstance.startBackgroundJobs()
  }
}
