import type { NextFetchEvent, NextRequest, NextResponse } from 'next/server'

/**
 * A proxy function, similar to NextProxy, but takes an additional context
 * parameter (intended to share state between proxy layers), and always returns
 * a Promise<NextResponse>.
 */
export type ChainableProxy = (
  request: NextRequest,
  event: NextFetchEvent,
  context: Record<string | symbol, any>
) => Promise<NextResponse>

/**
 * A function that adds one layer on to an existing ChainableProxy function. The
 * overall proxy function used by the application is built up by composing
 * multiple ProxyLayers together on top of a basic default ChainableProxy.
 */
export type ProxyLayer = (next: ChainableProxy) => ChainableProxy

/**
 * A simple filter that can be used to conditionally apply proxy layers based on
 * the incoming request and shared context.
 */
export type ProxyFilter = (request: NextRequest, context: Record<string | symbol, any>) => boolean
