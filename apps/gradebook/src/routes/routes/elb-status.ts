import { createFileRoute } from '@tanstack/react-router'

import { backgroundJobsEnabled } from '@/lib/deployment-mode'

// Load-balancer health probe. Neutral: served in every deployment mode. The
// body names the instance's mode and whether it runs jobs, so an operator can
// tell instances apart (spec: Deployment Modes item 6).
export const Route = createFileRoute('/routes/elb-status')({
  server: {
    handlers: {
      GET: async () => {
        const { getServerConfig } = await import('@/config')
        const config = getServerConfig()
        return Response.json({
          status: 'okay',
          mode: config.deployment.mode,
          jobs: backgroundJobsEnabled(config),
        })
      },
    },
  },
})
