import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware, appSessionMiddleware } from '@/lib/server-fn'

/**
 * Transitional action bridge (spec: Implementation Notes → action bridge).
 * Lets the shared forms keep calling the Next server actions they import,
 * while the TanStack Start host runs them as gated server functions:
 *
 * - Each bridged module has a `.start.ts` override (host-override convention)
 *   whose exports are `bridgeAction(...)` stubs with the original signatures.
 * - A stub sends its arguments to one of two generic server functions, gated
 *   by surface and session (`appSessionMiddleware` / `adminSessionMiddleware`,
 *   so the renewal boundary and principal check apply).
 * - The server looks the module up in `ACTION_REGISTRY`, runs the original
 *   export unchanged (its `next/headers` / `next/navigation` imports resolve to
 *   `@/lib/next-shims` on the Start server), and returns its result — or the
 *   target of a `redirect()` it threw, which the stub navigates to.
 *
 * No Next code runs on Start. Task 18 converts each bridged module into a
 * native server function and deletes this file, the registry and the shims.
 */

type BridgeOutcome = { kind: 'result'; value: unknown } | { kind: 'redirect'; url: string }

const FORM_PLACEHOLDER = '__modulus_form__'

const runBridged = async (surface: 'app' | 'admin', form: FormData): Promise<BridgeOutcome> => {
  const [{ ACTION_REGISTRY }, { ShimRedirect }] = await Promise.all([
    import('./action-registry.server'),
    import('./next-shims/navigation'),
  ])
  const key = String(form.get('__key'))
  const name = String(form.get('__export'))
  const entry = ACTION_REGISTRY[key]
  if (entry == null || entry.surface !== surface) {
    throw new Response('Not Found', { status: 404 })
  }
  const module = await entry.load()
  const action = module[name]
  if (typeof action !== 'function') throw new Response('Not Found', { status: 404 })

  // Rebuild the argument list: the FormData argument (if any) is this form,
  // minus the bridge's own fields.
  const payload = new FormData()
  for (const [field, value] of form.entries()) {
    if (!field.startsWith('__')) payload.append(field, value)
  }
  const args = (JSON.parse(String(form.get('__args'))) as unknown[]).map((arg) =>
    arg === FORM_PLACEHOLDER ? payload : arg
  )

  try {
    return { kind: 'result', value: await (action as (...a: unknown[]) => unknown)(...args) }
  } catch (error) {
    if (error instanceof ShimRedirect) return { kind: 'redirect', url: error.url }
    throw error
  }
}

const invokeAppAction = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => data)
  .handler(({ data }) => runBridged('app', data) as Promise<never>)

const invokeAdminAction = createServerFn({ method: 'POST' })
  .middleware([adminSessionMiddleware])
  .validator((data: FormData) => data)
  .handler(({ data }) => runBridged('admin', data) as Promise<never>)

/** A client stub with the original action's signature. */
export const bridgeAction =
  <TArgs extends unknown[], TResult>(surface: 'app' | 'admin', key: string, name: string) =>
  async (...args: TArgs): Promise<TResult> => {
    const form = new FormData()
    const serialisable = args.map((arg) => {
      if (arg instanceof FormData) {
        for (const [field, value] of arg.entries()) form.append(field, value)
        return FORM_PLACEHOLDER
      }
      return arg
    })
    form.set('__key', key)
    form.set('__export', name)
    form.set('__args', JSON.stringify(serialisable))

    const invoke = surface === 'app' ? invokeAppAction : invokeAdminAction
    const outcome = (await invoke({ data: form })) as BridgeOutcome
    if (outcome.kind === 'redirect') {
      // A full load, so the server renders the new state (and any flash).
      window.location.assign(outcome.url)
      return new Promise<TResult>(() => {})
    }
    return outcome.value as TResult
  }
