'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button, Container, ReturnIcon, Section } from '@infonomic/uikit/react'

import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export default function NotFound(): React.JSX.Element {
  const router = useRouter()
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Dashboard"
            homePath="/dashboard"
            breadcrumbs={[{ label: 'Not Found', href: '#' }]}
          />
        </Container>
      </Section>

      <Section className="py-6 flex flex-1 items-center justify-center">
        <Container className="flex items-center flex-col min-h-[350px] sm:min-h-[350px] pt-[8vh] sm:pt-[50px]">
          <h1>Oops! Not found</h1>
          <p className="text-center">
            The page or resource you&apos;re looking for could not be found.
          </p>
          <div className="actions flex gap-3 py-2">
            <Button render={<Link href="/dashboard" />}>Dashboard</Button>
            <Button
              onClick={() => {
                router.back()
              }}
            >
              Back{' '}
              <ReturnIcon
                width="18px"
                height="18px"
                svgClassName="fill-white stroke-white dark:fill-black dark:stroke-black"
              />
            </Button>
          </div>
        </Container>
      </Section>
    </>
  )
}
