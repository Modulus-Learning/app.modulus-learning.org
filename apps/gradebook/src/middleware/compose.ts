import { type NextProxy, NextResponse } from 'next/server'

import type { ChainableProxy, ProxyFilter, ProxyLayer } from './@types'

/**
 * Helper to compose multiple ProxyLayers into a single ProxyLayer.
 */
export const composeProxyLayers =
  (layers: ProxyLayer[]): ProxyLayer =>
  (next) =>
    layers.reduceRight((rest, current) => current(rest), next)

/**
 * The default / base ChainableProxy function.  As with all ChainableProxy
 * functions, it must pass the request headers into the NextResponse it
 * constructs.
 *
 * TODO: Look more closely at the discussion at
 * https://nextjs.org/docs/app/api-reference/functions/next-response#next and
 * possibly rethink the strategy for collecting and passing headers and cookies.
 */
export const defaultProxy: ChainableProxy = async (request) =>
  NextResponse.next({ request: { headers: request.headers } })

/**
 * Main method for composing multiple ProxyLayers into a single NextProxy
 * instance.
 *
 * A ProxyLayer is a function that takes a ChainableProxy instance representing
 * the chain of proxy middleware that runs after the current layer, and produces
 * a ChainableMiddleware instance representing the combination of the current
 * layer with the given chain.
 *
 * To support this, we limit ourselves to ChainableProxy, which always returns
 * Promise<NextResponse>, as opposed to a few other return types that NextProxy
 * allows in general.  This restriction allows middleware layers to modify
 * response cookies and headers in a consistent way: each layer receives a
 * NextResponse from the next layer in the chain (or constructs a NextResponse
 * on its own), and can add cookies and headers to it before passing it back up
 * the stack.
 *
 * Important: layers must always construct NextResponse instances (specifically
 * the .next() and .rewrite() variants) by passing in the (possibly mutated)
 * request object's headers. Then any headers and cookies that have been set on
 * the request object (including by earlier layers) will be properly passed on
 * to the Next.js request handlers: page components, server actions and route
 * handlers.
 */
export const composeProxy = (
  layers: ProxyLayer[],
  next: ChainableProxy = defaultProxy
): NextProxy => {
  const proxy = composeProxyLayers(layers)(next)
  return (request, event) => proxy(request, event, {})
}

/**
 * Helper to construct a ProxyLayer that applies the given sequence of layers,
 * but only for requests that pass the given filter.  For requests that don't
 * pass the filter, this acts as a no-op layer.
 */
export const withFilter =
  (filter: ProxyFilter, ...layers: ProxyLayer[]): ProxyLayer =>
  (next) => {
    const chain = composeProxyLayers(layers)(next)
    return (request, event, context) => {
      if (filter(request, context)) {
        return chain(request, event, context)
      }
      return next(request, event, context)
    }
  }

/**
 * Helper to construct a ProxyLayer that checks the incoming request against a
 * sequence of filters and applies the layers corresponding to the first filter
 * that matches.  If no filter matches the request, this acts as a no-op layer.
 */
export const withSwitch =
  (...specs: [ProxyFilter, ...ProxyLayer[]][]): ProxyLayer =>
  (next) => {
    const chains = specs.map(([filter, ...layers]) => ({
      filter,
      chain: composeProxyLayers(layers)(next),
    }))

    return (request, event, context) => {
      for (const { filter, chain } of chains) {
        if (filter(request, context)) {
          return chain(request, event, context)
        }
      }
      return next(request, event, context)
    }
  }
