import { useEffect, useState, useSyncExternalStore } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'

import { Card } from '@infonomic/uikit/react'

import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { LessonSummaryProgressBar } from '@/ui/components/lesson-summary-progress-bar'
import { useModulus } from '@/ui/components/modulus-provider'

export const Route = createFileRoute('/_courses/calculus-1/')({
  component: RouteComponent,
})

const lessons = [
  { id: '01', title: 'Understanding functions', path: '/calculus-1/lesson-01' },
  { id: '02', title: 'Review of famous functions', path: '/calculus-1/lesson-02' },
  { id: '03', title: 'Stars and functions', path: '/calculus-1/lesson-03' },
  { id: '04', title: 'Average rate of change', path: null },
  { id: '05', title: 'Estimating limits', path: null },
  { id: '06', title: 'Infinite limits', path: null },
  { id: '07', title: 'Continuity', path: null },
  { id: '08', title: 'Limits at infinity', path: null },
  { id: '09', title: 'Derivatives from first principles', path: null },
  { id: '10', title: 'Derivative rules', path: null },
  { id: '11', title: 'Product and quotient rules', path: null },
  { id: '12', title: 'Chain rule', path: null },
]

function RouteComponent() {
  const { modulus } = useModulus()

  const modulusIsReady = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.isReady()
  )

  // This index page is itself an activity (with no problems of its own); its
  // progress is the cumulative roll-up its children report into.
  const courseProgress = useSyncExternalStore(
    (cb) => modulus.on('progress-changed', cb),
    () => modulus.progress()
  )

  // Per-child progress, keyed by lesson id, fetched from the agent's multi-URL
  // read once it's ready.
  const [childProgress, setChildProgress] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!modulusIsReady) return

    // Resolve each child's path to the absolute activity URL the server stores,
    // and remember which lesson id each URL belongs to.
    const idByUrl = new Map<string, string>()
    const urls: string[] = []
    for (const { id, path } of lessons) {
      if (path == null) continue
      const url = new URL(path, window.location.origin).toString()
      idByUrl.set(url, id)
      urls.push(url)
    }

    let cancelled = false
    modulus.getProgressFor(urls).then((results) => {
      if (cancelled) return
      const next: Record<string, number> = {}
      for (const { url, progress } of results) {
        const id = idByUrl.get(url)
        if (id != null) next[id] = progress
      }
      setChildProgress(next)
    })

    return () => {
      cancelled = true
    }
  }, [modulus, modulusIsReady])

  return (
    <div className="flex flex-col gap-8 items-center py-16 flex-1 w-full">
      <div className="w-full max-w-6xl px-6">
        <Breadcrumbs
          breadcrumbs={[{ label: 'Calculus 1', href: '/calculus-1' }]}
          className="mb-4"
        />
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Calculus 1</h1>
        <p className="text-gray-400">Select a lesson to get started.</p>
        <div className="mt-4 max-w-md">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-gray-400">Course progress</span>
            <span className="text-sm font-mono text-green-500">
              {Math.round(courseProgress * 100)}%
            </span>
          </div>
          <LessonSummaryProgressBar value={courseProgress} />
        </div>
      </div>
      <div className="w-full max-w-6xl px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons.map(({ id, title, path }) => {
            const progress = childProgress[id] ?? 0
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
