import { createFileRoute } from '@tanstack/react-router'

import { Hero } from '@/modules/app/home/components/hero'
import { Ximera } from '@/modules/app/home/components/ximera'
import { GradientGlow } from '@/ui/components/gradient'

export const Route = createFileRoute('/$lng/_public/')({
  component: function HomePage() {
    const { lng } = Route.useParams()
    return (
      <>
        <GradientGlow />
        <Hero lng={lng} />
        <Ximera />
      </>
    )
  },
})
