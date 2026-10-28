import { createFileRoute } from '@tanstack/react-router'

import { getRootConfigFn } from '@modulus-learning/host-tanstack-start/lib/public-config'
import { GradientGlow } from '@modulus-learning/host-tanstack-start/ui/components/gradient'

// The loader calls a packaged, gate-wrapped server function: directly during
// SSR, and over RPC when the browser navigates here.
export const Route = createFileRoute('/')({
  loader: () => getRootConfigFn(),
  component: function Home() {
    const { publicConfig } = Route.useLoaderData()
    return (
      <main>
        <GradientGlow />
        <p data-testid="site-name">{publicConfig.siteName}</p>
      </main>
    )
  },
})
