import { createFileRoute } from '@tanstack/react-router'

import { pageHead } from '@/lib/head'
import { ComingSoon } from '@/modules/app/home/components/coming-soon'
import { GradientGlow } from '@/ui/components/gradient'

export const Route = createFileRoute('/$lng/_public/about')({
  head: ({ matches }) => pageHead({ title: 'About', path: '/about' }, matches),
  component: () => (
    <>
      <GradientGlow />
      <ComingSoon />
    </>
  ),
})
