import { hostname } from 'node:os'

// Server-only. The spike greps built client assets for this marker; finding it
// means packaged server code leaked into the browser bundle.
const SERVER_MARKER = 'MODULUS_SPIKE_SERVER_ONLY_MARKER'

export const greet = (name: string): string => `${SERVER_MARKER}:${hostname()}:hello ${name}`
