/**
 * Form-action server functions (the app's mutations). Each mutation module
 * `x.ts` is a literal `createServerFn({ method: 'POST' })` behind its session
 * gate whose handler runs the logic in `x.server.ts`; this module carries the
 * shared, isomorphic parts:
 *
 * - `actionEnvelope` packs the action's arguments into one FormData, so a form
 *   action's own FormData argument travels as itself;
 * - `readActionArgs` (the validator) unpacks it, refusing anything malformed
 *   with a 400 before the handler runs;
 * - `followOutcome` resolves to the action's result on the client, or follows
 *   the redirect the action ended with as a full-page navigation, so the
 *   server renders the new state (and any flash message).
 *
 * The server half (`runAction`) lives in `./server-action.server`.
 */

export type ActionOutcome<T> = { kind: 'result'; value: T } | { kind: 'redirect'; url: string }

const FORM_PLACEHOLDER = '__modulus_form__'
const ARGS_FIELD = '__args'

const badRequest = () => new Response('Bad Request', { status: 400 })

export const actionEnvelope = (args: unknown[]): FormData => {
  const form = new FormData()
  const serialisable = args.map((arg) => {
    if (arg instanceof FormData) {
      for (const [field, value] of arg.entries()) form.append(field, value)
      return FORM_PLACEHOLDER
    }
    return arg
  })
  form.set(ARGS_FIELD, JSON.stringify(serialisable))
  return form
}

export const readActionArgs = (form: unknown): unknown[] => {
  if (!(form instanceof FormData)) throw badRequest()
  const raw = form.get(ARGS_FIELD)
  if (typeof raw !== 'string') throw badRequest()
  let args: unknown
  try {
    args = JSON.parse(raw)
  } catch {
    throw badRequest()
  }
  if (!Array.isArray(args)) throw badRequest()
  const payload = new FormData()
  for (const [field, value] of form.entries()) {
    if (!field.startsWith('__')) payload.append(field, value)
  }
  return args.map((arg) => (arg === FORM_PLACEHOLDER ? payload : arg))
}

export const followOutcome = <T>(outcome: ActionOutcome<T>): Promise<T> => {
  if (outcome.kind === 'redirect') {
    window.location.assign(outcome.url)
    return new Promise<T>(() => {})
  }
  return Promise.resolve(outcome.value)
}
