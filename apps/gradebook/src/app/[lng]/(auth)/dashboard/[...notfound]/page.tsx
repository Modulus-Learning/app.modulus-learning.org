import { notFound } from 'next/navigation'

// Catch-all route so that we will always render the not-found.tsx handler
// located beneath app/[lng] - and not the built-in default static
// Next.js not found page.
export default function CatchAll(): never {
  return notFound()
}
