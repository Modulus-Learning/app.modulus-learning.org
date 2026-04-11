import { createFileRoute, Link } from '@tanstack/react-router'

import { Card, Container, Section } from '@infonomic/uikit/react'

const COURSES = [
  {
    name: 'Calculus 1',
    path: '/calculus-1' as const,
    description: 'Limits, derivatives, and an introduction to integration.',
  },
  {
    name: 'Calculus 2',
    path: '/calculus-2' as const,
    description: 'Techniques of integration, sequences, and series.',
  },
]

function LandingPage() {
  return (
    <>
      <Section className="pt-[4vh] sm:pt-[8vh] sm:pb-4">
        <Container className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Contoso Learning Institute</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            An open platform for interactive learning experiences. Explore our courses below and
            start your journey.
          </p>
        </Container>
      </Section>

      <Section className="py-12">
        <Container className="max-w-3xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {COURSES.map(({ name, path, description }) => (
              <Link key={path} to={path} className="no-underline">
                <Card className="p-6 hover:ring-2 hover:ring-green-500/50 transition-all h-full">
                  <Card.Header>
                    <Card.Title>{name}</Card.Title>
                  </Card.Header>
                  <Card.Content>
                    <p className="text-gray-400">{description}</p>
                  </Card.Content>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>
    </>
  )
}

export const Route = createFileRoute('/_public/')({
  component: LandingPage,
})
