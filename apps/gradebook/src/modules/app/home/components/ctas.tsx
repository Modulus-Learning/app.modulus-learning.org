'use client'

import { Button } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'

export function Ctas({ lng }: { lng: Locale }) {
  return (
    <div className="ctas flex flex-col sm:flex-row gap-5 mt-14 mb-4">
      <Button render={<LangLink lng={lng} href="/dashboard" />} size="lg">
        Get Started
      </Button>
      <Button variant="outlined" size="lg">
        Read the Docs
      </Button>
    </div>
  )
}
