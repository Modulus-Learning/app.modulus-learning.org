import { createStart } from '@tanstack/react-start'

import { modulusStartOptions } from '@modulus-learning/host-tanstack-start/server/start'

// Start's compiler requires a literal `createStart` here; the request
// middleware (CSRF, request kind, flash, CSP) is Modulus's.
export const startInstance = createStart(() => modulusStartOptions())
