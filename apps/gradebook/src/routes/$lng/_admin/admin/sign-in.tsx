import { createFileRoute } from '@tanstack/react-router'

import { Container, ScrollToTop, Section } from '@infonomic/uikit/react'
import { Image } from '@modulus-learning/host-tanstack-start/framework/index'
import logoBlack from '@modulus-learning/host-tanstack-start/images/logo/modulus-logo-symbol-black.svg'
import logoWhite from '@modulus-learning/host-tanstack-start/images/logo/modulus-logo-symbol-white.svg'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { SignInForm } from '@modulus-learning/host-tanstack-start/modules/admin/session/components/sign-in-form'
import { AdminAppBarPublic } from '@modulus-learning/host-tanstack-start/ui/components/admin/admin-app-bar-public'
import { SiteFooter } from '@modulus-learning/host-tanstack-start/ui/components/site-footer'

// Admin sign-in. Deliberately outside `_authed`, so it is never itself
// redirected (the Next `withAdminAuth` matched only an unprefixed
// `/admin/sign-in`, which looped for `/es/admin/sign-in`).
export const Route = createFileRoute('/$lng/_admin/admin/sign-in')({
  head: ({ matches }) => pageHead({ title: 'Admin Sign In', path: '/admin/sign-in' }, matches),
  component: function AdminSignInPage() {
    const { lng } = Route.useParams()
    return (
      <div className="layout-container root flex min-h-screen flex-col">
        <AdminAppBarPublic lng={lng} />
        <main id="main-content" className="flex flex-1 flex-col">
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
                <SignInForm lng={lng} />
              </div>
            </Container>
          </Section>
        </main>
        <SiteFooter lng={lng} />
        <ScrollToTop />
      </div>
    )
  },
})
