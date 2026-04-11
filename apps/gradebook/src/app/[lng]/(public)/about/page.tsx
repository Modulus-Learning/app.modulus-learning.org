import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { ComingSoon } from '@/modules/app/home/components/coming-soon'
import { GradientGlow } from '@/ui/components/gradient'
import type { Locale } from '@/i18n/i18n-config'

// // Use this to debug ISR
// // export const dynamic = 'error'
export const dynamicParams = true // explicit, though default
// generateStaticParams stub - so that static pages can be generated on first request.
export async function generateStaticParams() {
  return []
}
export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng)
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  return (
    <>
      <GradientGlow />
      <ComingSoon />
    </>
  )
}
