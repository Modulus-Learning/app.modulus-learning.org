import { useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { Image } from '@/framework/index'
import { SignIn } from '@/modules/app/session/components/sign-in'
import logoBlack from '../../../images/logo/modulus-logo-symbol-black.svg'
import logoWhite from '../../../images/logo/modulus-logo-symbol-white.svg'

export const Page = function SignInPage() {
  const { lng } = useParams({ strict: false })
  return (
    <Section>
      <Container>
        <div className="flex flex-col items-center justify-center mb-8 mt-4 sm:mt-[4vh]">
          <div className="flex w-[70px] h-[70px] items-center justify-center mb-6">
            <Image className="hidden dark:block m-0 p-0" src={logoWhite} width={70} alt="Modulus" />
            <Image className="block dark:hidden m-0 p-0" src={logoBlack} width={70} alt="Modulus" />
          </div>
          <SignIn style="default" lng={lng} source="/sign-in" callBackUrl="/" />
        </div>
      </Container>
    </Section>
  )
}
