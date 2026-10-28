import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { Image } from '@modulus-learning/host-tanstack-start/framework/index'
import logoBlack from '@modulus-learning/host-tanstack-start/images/logo/modulus-logo-symbol-black.svg'
import logoWhite from '@modulus-learning/host-tanstack-start/images/logo/modulus-logo-symbol-white.svg'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { Register } from '@modulus-learning/host-tanstack-start/modules/app/registration/components/register'

export const Route = createFileRoute('/$lng/_forms/sign-up')({
  head: ({ matches }) => pageHead({ title: 'Sign Up', path: '/sign-up' }, matches),
  component: function SignUpPage() {
    const { lng } = Route.useParams()
    return (
      <Section>
        <Container className="sm:px-[32px]">
          <div className="flex flex-col items-center justify-center mt-4 sm:mt-[4vh] mb-8">
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
            <Register style="default" lng={lng} callbackUrl="/" />
          </div>
        </Container>
      </Section>
    )
  },
})
