import { Container, Section } from '@infonomic/uikit/react'

export function Ximera() {
  return (
    <Section
      id="about"
      className="py-8 md:py-18 border-y border-gray-100 dark:border-gray-700 bg-secondary/20"
    >
      <Container className="max-w-[1024px] mx-auto text-center prose">
        <h2 className="mb-4 text-balance">Part of the Ximera Ecosystem</h2>
        <p className="text-muted-foreground text-lg mb-6 text-pretty">
          <strong className="text-foreground">Ximera</strong> is an open-source, interactive
          textbook platform, most commonly used in teaching math. The name stands for{' '}
          <span className="text-teal-500 font-medium">
            {'"'}Ximera: Interactive, Mathematics, Education, Resources, for All.{'"'}
          </span>
        </p>
        <p className="text-muted-foreground text-pretty">
          Both Modulus and Ximera share a commitment to providing open educational resources (OER)
          for all.
        </p>
      </Container>
    </Section>
  )
}
