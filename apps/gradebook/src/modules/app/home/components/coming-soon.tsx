import Link from 'next/link'

import { Button, Container, Section } from '@infonomic/uikit/react'
import { ArrowRight, BookOpen, ExternalLink } from 'lucide-react'

import { HeroAnimation } from './hero-animation'

export function ComingSoon() {
  return (
    <Section className="pt-8 md:pt-14 pb-20 overflow-hidden">
      <Container className="xl:max-w-[68rem] 2xl:max-w-[74.375rem]">
        {/* <Container className="mx-auto lg:max-w-[1050px] xl:max-w-[1100px] 2xl:max-w-[1150px]"> */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-12 items-center">
          {/* Left: Content */}
          <div className="text-center lg:text-left">
            {/* Early development badge */}
            <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500"></span>
              </span>
              <span className="text-sm text-accent font-medium">In Development</span>
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-6xl font-bold text-foreground mb-6 text-balance leading-[1.05]">
              Coming{' '}
              <span className="bg-linear-to-r from-sky-500 via-sky-400 to-fuchsia-500 bg-clip-text text-transparent">
                Soon
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground mb-4 text-pretty">
              Modulus is in active development. There will be more information coming soon!
            </p>

            <p className="text-muted-foreground mb-8 max-w-lg mx-auto lg:mx-0 text-pretty">
              An assignment-grade database designed to track progress on Ximera assignments using
              time-series data and latest page-state snapshots. Helping instructors understand their
              assignments.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <Button
                render={<Link href="#" />}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
              >
                View on GitHub
                <ExternalLink className="ml-2 h-4 w-4" />

              </Button>
              <Button
                render={<Link href="https://ximera.osu.edu/" target="_blank" rel="noopener noreferrer" />}
                variant="outlined"
                size="lg"
                className="w-full sm:w-auto border-border text-foreground hover:bg-secondary bg-transparent"
              >
                Learn about Ximera
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Additional info */}
            <div className="mt-8 flex items-center gap-2 justify-center lg:justify-start text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>Documentation and installation instructions coming soon</span>
            </div>
          </div>

          {/* Right: Animation */}
          <div className="lg:pl-4">
            <HeroAnimation />
          </div>
        </div>
      </Container>
    </Section>
  )
}
