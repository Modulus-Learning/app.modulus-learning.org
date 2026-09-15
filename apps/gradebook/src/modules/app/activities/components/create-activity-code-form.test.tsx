import { act, type ChangeEvent, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ActivityCodeFormState } from '../@types'

const mocks = vi.hoisted(() => ({ createActivityCode: vi.fn() }))

vi.mock('../create-activity-code', () => ({ createActivityCode: mocks.createActivityCode }))
vi.mock('@/i18n/components/lang-link', () => ({
  LangLink: ({ children }: { children?: ReactNode }) => <a href="/dashboard">{children}</a>,
}))
vi.mock('./request-activity-code-form', () => ({
  RequestActivityCodeForm: ({ onRequested }: { onRequested: (code: string) => void }) => (
    <button type="button" data-testid="request-code" onClick={() => onRequested('brave-otter')}>
      Request
    </button>
  ),
}))

type FieldProps = {
  name?: string
  value?: string
  onChange?: (event: ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => void
  error?: boolean
  errorText?: string
}

// Stand-ins that keep the real value and change wiring, and surface the error
// props as attributes and text so a rendered warning can be asserted.
vi.mock('@infonomic/uikit/react', () => ({
  Button: ({
    children,
    type = 'button',
    disabled,
  }: {
    children?: ReactNode
    type?: 'button' | 'submit'
    disabled?: boolean
  }) => (
    <button type={type} disabled={disabled}>
      {children}
    </button>
  ),
  ErrorText: ({ text }: { text?: string }) => <p data-testid="banner">{text}</p>,
  Input: ({ name, value, onChange, error, errorText }: FieldProps) => (
    <div>
      <input name={name} value={value} onChange={onChange} data-error={String(Boolean(error))} />
      {error && <p data-testid={`${name}-error`}>{errorText}</p>}
    </div>
  ),
  TextArea: ({ name, value, onChange, error, errorText }: FieldProps) => (
    <div>
      <textarea name={name} value={value} onChange={onChange} data-error={String(Boolean(error))} />
      {error && <p data-testid={`${name}-error`}>{errorText}</p>}
    </div>
  ),
}))

import { ACTIVITY_URL_MESSAGES, URL_PREFIX_MESSAGES } from '../@types/validate-urls'
import { CreateActivityCodeForm } from './create-activity-code-form'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const DENIAL =
  'Line 2: HTTPS://CONTENT.test/denied. This Modulus site does not admit this new activity URL. Contact a Modulus administrator to request access.'

let container: HTMLDivElement
let root: Root

const field = <T extends HTMLElement>(selector: string): T => {
  const element = container.querySelector<T>(selector)
  if (element == null) throw new Error(`missing ${selector}`)
  return element
}
const urls = () => field<HTMLTextAreaElement>('textarea[name="urls"]')
const prefix = () => field<HTMLInputElement>('input[name="url_prefix"]')
const errorFor = (name: string) =>
  container.querySelector(`[data-testid="${name}-error"]`)?.textContent ?? null
const submitButton = () => field<HTMLButtonElement>('button[type="submit"]')

/** Types into a controlled field the way a browser does. */
const type = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = Object.getPrototypeOf(element)
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const submit = async () => {
  await act(async () => {
    field<HTMLFormElement>('form').requestSubmit()
  })
}

const render = async () => {
  await act(async () => {
    root.render(<CreateActivityCodeForm lng="en" />)
  })
  await act(async () => {
    field<HTMLButtonElement>('[data-testid="request-code"]').click()
  })
}

describe('CreateActivityCodeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test('warns about a query or fragment on its physical line and keeps the typed text', async () => {
    await render()
    const typed = 'https://content.test/a\n\nhttps://content.test/b?\nhttps://content.test/c#'
    await type(urls(), typed)

    expect(errorFor('urls')).toBe(`Lines 3, 4: ${ACTIVITY_URL_MESSAGES.unsupported_url_components}`)
    expect(errorFor('urls')).not.toMatch(/administrator|request access/i)
    expect(urls().value).toBe(typed)
    expect(submitButton().disabled).toBe(true)

    await submit()
    expect(mocks.createActivityCode).not.toHaveBeenCalled()
  })

  test('warns about a prefix with components without replacing it', async () => {
    await render()
    await type(prefix(), 'https://content.test/course/?term=')

    expect(errorFor('url_prefix')).toBe(URL_PREFIX_MESSAGES.unsupported_url_components)
    expect(prefix().value).toBe('https://content.test/course/?term=')
  })

  test('accepts canonical prefix equivalents and encoded delimiters locally', async () => {
    await render()
    await type(prefix(), 'HTTPS://Content.test:443/course/')
    await type(urls(), 'https://content.test/course/a%3Fb%23c\nhttps://CONTENT.TEST/course/d')

    expect(errorFor('urls')).toBeNull()
    expect(errorFor('url_prefix')).toBeNull()
    expect(submitButton().disabled).toBe(false)
  })

  test('adds no client-side admission gate for parseable scheme or credential urls', async () => {
    mocks.createActivityCode.mockResolvedValue({ errors: {}, status: 'idle' })
    await render()
    await type(urls(), 'http://content.test/a\nhttps://user:secret@content.test/b')

    expect(errorFor('urls')).toBeNull()
    await submit()
    expect(mocks.createActivityCode).toHaveBeenCalledTimes(1)
  })

  test('shows server field warnings and preserves every entered value', async () => {
    const failed: ActivityCodeFormState = {
      errors: { urls: [DENIAL], url_prefix: [URL_PREFIX_MESSAGES.url_too_long] },
      message: 'Some activity URLs could not be registered.',
      status: 'failed',
    }
    mocks.createActivityCode.mockResolvedValue(failed)

    await render()
    const typedPrefix = 'HTTPS://Content.test:443/'
    const typedUrls = 'https://content.test/ok\nHTTPS://CONTENT.test/denied'
    await type(prefix(), typedPrefix)
    await type(urls(), typedUrls)
    await submit()

    const submitted = mocks.createActivityCode.mock.calls[0]?.[1] as FormData
    expect(submitted.get('urls')).toBe(typedUrls)
    expect(submitted.get('url_prefix')).toBe(typedPrefix)

    expect(errorFor('urls')).toBe(DENIAL)
    expect(errorFor('url_prefix')).toBe(URL_PREFIX_MESSAGES.url_too_long)
    // Normalized values are for comparison and storage, never for the field.
    expect(urls().value).toBe(typedUrls)
    expect(prefix().value).toBe(typedPrefix)
  })

  test('hides a stale server warning once its field is edited, and allows resubmission', async () => {
    mocks.createActivityCode.mockResolvedValueOnce({
      errors: { urls: [DENIAL], url_prefix: [URL_PREFIX_MESSAGES.url_too_long] },
      message: 'Some activity URLs could not be registered.',
      status: 'failed',
    })
    mocks.createActivityCode.mockResolvedValueOnce({ errors: {}, status: 'idle' })

    await render()
    await type(urls(), 'https://elsewhere.test/one')
    await submit()
    expect(errorFor('urls')).toBe(DENIAL)

    await type(urls(), 'https://content.test/one')

    expect(errorFor('urls')).toBeNull()
    // The prefix was not edited, so its warning still applies.
    expect(errorFor('url_prefix')).toBe(URL_PREFIX_MESSAGES.url_too_long)
    expect(submitButton().disabled).toBe(false)

    await submit()
    expect(mocks.createActivityCode).toHaveBeenCalledTimes(2)
    expect(errorFor('url_prefix')).toBeNull()
  })

  test('does not attach a delayed rejection to values edited while it was pending', async () => {
    let respond: (state: ActivityCodeFormState) => void = () => {}
    mocks.createActivityCode.mockReturnValueOnce(
      new Promise<ActivityCodeFormState>((resolve) => {
        respond = resolve
      })
    )
    mocks.createActivityCode.mockResolvedValueOnce({ errors: {}, status: 'idle' })

    await render()
    await type(prefix(), 'https://content.test/')
    await type(urls(), 'https://content.test/denied')
    await submit()
    expect(submitButton().disabled).toBe(true)

    // Corrected while the request is still pending.
    await type(urls(), 'https://content.test/fixed')

    await act(async () => {
      respond({
        errors: { urls: [DENIAL], url_prefix: [URL_PREFIX_MESSAGES.url_too_long] },
        message: 'Some activity URLs could not be registered.',
        status: 'failed',
      })
    })

    // The URL field changed, so its rejection does not apply to the new value;
    // the prefix did not, so its warning does.
    expect(errorFor('urls')).toBeNull()
    expect(errorFor('url_prefix')).toBe(URL_PREFIX_MESSAGES.url_too_long)
    expect(urls().value).toBe('https://content.test/fixed')
    expect(submitButton().disabled).toBe(false)

    await submit()
    expect(mocks.createActivityCode).toHaveBeenCalledTimes(2)
    const resubmitted = mocks.createActivityCode.mock.calls[1]?.[1] as FormData | undefined
    expect(resubmitted?.get('urls')).toBe('https://content.test/fixed')
  })
})
