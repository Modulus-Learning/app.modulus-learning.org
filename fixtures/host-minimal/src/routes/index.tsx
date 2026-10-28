import { createFileRoute } from '@tanstack/react-router'

import { GradientGlow } from '@modulus-learning/host-tanstack-start/ui/components/gradient'

export const Route = createFileRoute('/')({
  component: () => (
    <main>
      <GradientGlow />
    </main>
  ),
})
