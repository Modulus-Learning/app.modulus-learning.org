import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { greetServerFn } from './server-fn.js'

function SpikePage() {
  const [result, setResult] = useState<string>('not called')
  return (
    <main className="p-4">
      <p className="bg-[#c0ffee] text-[#0b5a3a]" data-testid="styled">
        packaged styles
      </p>
      <button type="button" onClick={async () => setResult(await greetServerFn({ data: 'spike' }))}>
        call server fn
      </button>
      <output data-testid="result">{result}</output>
    </main>
  )
}

// Page route factory: the host route file re-exports this with its own path.
export const createSpikePageRoute = <P extends string>(path: P) =>
  // biome-ignore lint/suspicious/noExplicitAny: spike — path typing is the host route file's concern
  createFileRoute(path as any)({ component: SpikePage })
