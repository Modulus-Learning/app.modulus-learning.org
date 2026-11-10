import { createFileRoute, notFound } from '@tanstack/react-router'

// Catch-all under the public layout, so unknown paths render the layout's
// not-found view (with the public chrome) rather than a bare 404.
export const Route = createFileRoute('/$lng/_public/$')({
  loader: () => {
    throw notFound()
  },
})
