import Image from 'next/image'

import { Container, Section } from '@infonomic/uikit/react'

import logoBlack from '@/images/logo/modulus-logo-symbol-black.svg'
import logoWhite from '@/images/logo/modulus-logo-symbol-white.svg'
import { SignInForm } from '@/modules/admin/session/components/sign-in-form'
import type { Locale } from '@/i18n/i18n-config'

export default async function SignInPage({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<React.JSX.Element> {
  const { lng } = await params
  return (
    <Section>
      <Container>
        <div className="flex flex-col items-center justify-center mb-8 mt-4 sm:mt-[4vh]">
          <div className="flex w-[70px] h-[70px] items-center justify-center mb-6">
            <Image className="hidden dark:block m-0 p-0" src={logoWhite} width={70} alt="Modulus" />
            <Image className="block dark:hidden m-0 p-0" src={logoBlack} width={70} alt="Modulus" />
          </div>
          <SignInForm lng={lng} />
        </div>
      </Container>
    </Section>
  )
}
