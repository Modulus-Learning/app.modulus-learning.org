import { createModulusRootRoute } from '@modulus-learning/host-tanstack-start/routes/__root.route'

// This installation's document choices; the document itself is Modulus's.
export const Route = createModulusRootRoute({
  appTitle: 'Modulus',
  analytics: {
    domain: 'modulus-learning.org',
    src: '/modules/js/script.js',
    api: '/modules/api/event',
  },
})
