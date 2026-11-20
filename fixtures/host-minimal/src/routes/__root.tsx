import { createModulusRootRoute } from '@modulus-learning/host-tanstack-start/routes/__root.route'

// The installation owns the stylesheet entry; this one uses the package default.
import '@modulus-learning/host-tanstack-start/styles.css'

export const Route = createModulusRootRoute({ appTitle: 'Fixture' })
