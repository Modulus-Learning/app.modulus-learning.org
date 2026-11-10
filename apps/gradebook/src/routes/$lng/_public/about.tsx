import { createFileRoute } from '@tanstack/react-router'

import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { GradientGlow } from '@modulus-learning/host-tanstack-start/ui/components/gradient'

import { ComingSoon } from '@/modules/app/home/components/coming-soon'

export const Route = createFileRoute('/$lng/_public/about')({
  head: ({ matches }) => pageHead({ title: 'About', path: '/about' }, matches),
  component: () => (
    <>
      <GradientGlow />
      <ComingSoon />
    </>
  ),
})
