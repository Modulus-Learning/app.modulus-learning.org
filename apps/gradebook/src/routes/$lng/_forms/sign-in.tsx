import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { Image } from '@modulus-learning/host-tanstack-start/framework/index'
import logoBlack from '@modulus-learning/host-tanstack-start/images/logo/modulus-logo-symbol-black.svg'
import logoWhite from '@modulus-learning/host-tanstack-start/images/logo/modulus-logo-symbol-white.svg'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { SignIn } from '@modulus-learning/host-tanstack-start/modules/app/session/components/sign-in'

export const Route = createFileRoute('/$lng/_forms/sign-in')({
  head: ({ matches }) => pageHead({ title: 'Sign In', path: '/sign-in' }, matches),
  component: function SignInPage() {
    const { lng } = Route.useParams()
    return (
      <Section>
        <Container>
          <div className="flex flex-col items-center justify-center mb-8 mt-4 sm:mt-[4vh]">
            <div className="flex w-[70px] h-[70px] items-center justify-center mb-6">
              <Image
                className="hidden dark:block m-0 p-0"
                src={logoWhite}
                width={70}
                alt="Modulus"
              />
              <Image
                className="block dark:hidden m-0 p-0"
                src={logoBlack}
                width={70}
                alt="Modulus"
              />
            </div>
            <SignIn style="default" lng={lng} source="/sign-in" callBackUrl="/" />
          </div>
        </Container>
      </Section>
    )
  },
})
