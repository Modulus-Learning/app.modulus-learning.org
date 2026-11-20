import { createModulusRootRoute } from '@modulus-learning/host-tanstack-start/routes/__root.route'

// The installation owns the stylesheet entry (kit and Modulus CSS, then one
// Tailwind entry), so installation theme values compile with the package's.
import '../ui/styles/global.css'

// This installation's document choices; the document itself is Modulus's.
export const Route = createModulusRootRoute({
  appTitle: 'Modulus',
  analytics: {
    domain: 'modulus-learning.org',
    src: '/modules/js/script.js',
    api: '/modules/api/event',
  },
})
