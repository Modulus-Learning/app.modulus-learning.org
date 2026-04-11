import { Hero } from '@/modules/app/home/components/hero'
import { Ximera } from '@/modules/app/home/components/ximera'
import { GradientGlow } from '@/ui/components/gradient'
import type { Locale } from '@/i18n/i18n-config'

export default async function HomePage({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  return (
    <>
      <GradientGlow />
      <Hero lng={lng} />
      <Ximera />
    </>
  )
}
