import { backgroundJobsEnabled } from '@/lib/deployment-mode'

// Load-balancer health probe. Neutral: served in every deployment mode. The
// body names the instance's mode and whether it runs jobs, so an operator can
// tell instances apart (spec: Deployment Modes item 6). The instance is healthy
// only once core has initialised — including its schema check — so a probe
// waits for that and answers 503 if it failed.
export const handlers = {
  GET: async () => {
    const [{ getServerConfig }, { getCoreInstance }, { getServerLogger }] = await Promise.all([
      import('@/config/index'),
      import('@/lib/core/instance'),
      import('@/lib/server-logger'),
    ])
    const config = getServerConfig()
    const instance = { mode: config.deployment.mode, jobs: backgroundJobsEnabled(config) }
    try {
      await getCoreInstance(getServerLogger())
    } catch {
      return Response.json({ status: 'unavailable', ...instance }, { status: 503 })
    }
    return Response.json({ status: 'okay', ...instance })
  },
}
