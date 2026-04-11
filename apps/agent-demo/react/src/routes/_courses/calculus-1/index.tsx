import { createFileRoute, Link } from '@tanstack/react-router'

import { Card } from '@infonomic/uikit/react'

import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { LessonSummaryProgressBar } from '@/ui/components/lesson-summary-progress-bar'

export const Route = createFileRoute('/_courses/calculus-1/')({
  component: RouteComponent,
})

function RouteComponent() {
  const lessons = [
    { id: '01', title: 'Understanding functions', path: '/calculus-1/lesson-01', progress: 1 },
    { id: '02', title: 'Review of famous functions', path: '/calculus-1/lesson-02', progress: 0.6 },
    { id: '03', title: 'Stars and functions', path: '/calculus-1/lesson-03', progress: 0.25 },
    { id: '04', title: 'Average rate of change', path: null, progress: 0 },
    { id: '05', title: 'Estimating limits', path: null, progress: 0 },
    { id: '06', title: 'Infinite limits', path: null, progress: 0 },
    { id: '07', title: 'Continuity', path: null, progress: 0 },
    { id: '08', title: 'Limits at infinity', path: null, progress: 0 },
    { id: '09', title: 'Derivatives from first principles', path: null, progress: 0 },
    { id: '10', title: 'Derivative rules', path: null, progress: 0 },
    { id: '11', title: 'Product and quotient rules', path: null, progress: 0 },
    { id: '12', title: 'Chain rule', path: null, progress: 0 },
  ]

  return (
    <div className="flex flex-col gap-8 items-center py-16 flex-1 w-full">
      <div className="w-full max-w-6xl px-6">
        <Breadcrumbs
          breadcrumbs={[{ label: 'Calculus 1', href: '/calculus-1' }]}
          className="mb-4"
        />
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Calculus 1</h1>
        <p className="text-gray-400">Select a lesson to get started.</p>
      </div>
      <div className="w-full max-w-6xl px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons.map(({ id, title, path, progress }) => {
            const card = (
              <Card
                className={`p-2 h-full transition-all ${
                  path ? 'hover:ring-2 hover:ring-green-500/50' : 'opacity-70'
                }`}
              >
                <Card.Header>
                  <LessonSummaryProgressBar value={progress} className="mb-4" />
                  <span className="text-green-500 text-base font-mono mr-2">{id}</span>
                  <Card.Title>
                    <span>{title}</span>
                  </Card.Title>
                </Card.Header>
                <Card.Content>
                  <p className="text-gray-300 font-medium">{title}</p>
                  {!path && <p className="text-gray-500 mt-2">Placeholder</p>}
                </Card.Content>
              </Card>
            )

            if (path) {
              return (
                <Link key={id} to={path} className="no-underline">
                  {card}
                </Link>
              )
            }

            return (
              <div key={id} className="cursor-default">
                {card}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
