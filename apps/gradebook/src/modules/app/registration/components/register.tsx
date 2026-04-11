'use client'

import type React from 'react'
import { useState } from 'react'

import { RegistrationStep1 } from '@/modules/app/registration/components/registration-step1'
import { RegistrationStep2 } from '@/modules/app/registration/components/registration-step2'
import { RegistrationStep3 } from '@/modules/app/registration/components/registration-step3'
import type { Locale } from '@/i18n/i18n-config'

export function Register({
  lng,
  callbackUrl,
  style = 'default',
}: {
  lng: Locale
  callbackUrl: string
  style: 'default' | 'compact'
}): React.JSX.Element | null {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<Record<string, any> | undefined>(undefined)

  const handleOnStepSubmit = (nextStep: number, data: Record<string, any> | undefined) => {
    setStep(nextStep)
    if (data != null) setData(data)
  }

  if (step === 1) {
    return <RegistrationStep1 style={style} lng={lng} data={data} onSubmit={handleOnStepSubmit} />
  }

  if (step === 2) {
    return <RegistrationStep2 style={style} lng={lng} data={data} onSubmit={handleOnStepSubmit} />
  }

  if (step === 3) {
    return (
      <RegistrationStep3
        style={style}
        lng={lng}
        data={data}
        onSubmit={handleOnStepSubmit}
        callbackUrl={callbackUrl}
      />
    )
  }
  return null
}
