import { act, type ChangeEvent, createElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ActivityCodeFormState } from '../@types'

const mocks = vi.hoisted(() => ({
  // When set, `useActionState` is driven directly with this state; otherwise
  // the real hook runs against the mocked action below.
  formState: null as ActivityCodeFormState | null,
  updateActivityCode: vi.fn(),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: ((...args: Parameters<typeof actual.useActionState>) => {
      const live = actual.useActionState(...args)
      return mocks.formState == null ? live : [mocks.formState, () => {}, false]
    }) as typeof actual.useActionState,
  }
})

type FieldProps = {
  name?: string
  value?: string
  onChange?: (event: ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => void
  error?: boolean
  errorText?: string
}

// Stand-ins that keep the real value and change wiring, and surface the props
// under test as attributes.
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
    <button type={type === 'submit' ? 'submit' : 'button'} disabled={disabled}>
      {children}
    </button>
  ),
  ErrorText: ({ text }: { text?: string }) => createElement('p', { 'data-testid': 'banner' }, text),
  Input: ({ name, value, onChange, error, errorText }: FieldProps) =>
    createElement('input', {
      name,
      value,
      onChange,
      'data-error': String(Boolean(error)),
      'data-error-text': errorText,
    }),
  TextArea: ({ name, value, onChange, error, errorText }: FieldProps) =>
    createElement('textarea', {
      name,
      value,
      onChange,
      'data-error': String(Boolean(error)),
      'data-error-text': errorText,
    }),
}))

vi.mock('@/i18n/components/lang-link', () => ({
  LangLink: ({ children }: { children?: ReactNode }) => createElement('a', {}, children),
}))
vi.mock('../update-activity-code', () => ({ updateActivityCode: mocks.updateActivityCode }))

import { ACTIVITY_URL_MESSAGES, URL_PREFIX_MESSAGES } from '../@types/validate-urls'
import { UpdateActivityCodeForm } from './update-activity-code-form'
import type { Activity, ActivityCode } from '../@types'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const TIMESTAMP = '2026-09-04T00:00:00.000Z'

const DENIAL =
  'Line 1: https://elsewhere.test/one. This Modulus site does not admit this new activity URL. Contact a Modulus administrator to request access.'

const activityCode = (overrides: Partial<ActivityCode> = {}): ActivityCode => ({
  id: '019c2d8e-842a-7715-a323-a7e31427db2d',
  created_by: '019c2d8e-842a-7715-a323-a7e31427db2f',
  code: 'brave-otter',
  private_code: 'private',
  url_prefix: null,
  description: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  ...overrides,
})

const activity = (url: string): Activity => ({
  id: `019c2d8e-842a-7715-a323-${url.length.toString().padStart(12, '0')}`,
  url,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
})

const form = (
  code: ActivityCode = activityCode(),
  activities = [activity('https://content.test/a')]
) => <UpdateActivityCodeForm lng="en" activityCode={code} activities={activities} />

/**
 * Renders the default form as a response to a submission of its loaded values,
 * unless `submitted` says the response was for other values.
 */
const renderForm = (
  formState: ActivityCodeFormState,
  submitted = { urls: 'https://content.test/a', url_prefix: '' }
): string => {
  mocks.formState = { ...formState, submitted } as ActivityCodeFormState
  return renderToStaticMarkup(form())
}

/** A field as rendered by the stand-ins above. */
const urlsField = (markup: string): string =>
  markup.match(/<textarea[^>]*name="urls"[^>]*>/)?.[0] ?? ''
const prefixField = (markup: string): string =>
  markup.match(/<input[^>]*name="url_prefix"[^>]*>/)?.[0] ?? ''

describe('UpdateActivityCodeForm url errors', () => {
  afterEach(() => {
    mocks.formState = null
  })

  test('renders a server url denial against the URL field, not only in the banner', () => {
    // The instructor has to know which lines to change; a banner alone leaves
    // them hunting through the textarea.
    const markup = renderForm({
      errors: { urls: [DENIAL] },
      message: 'Some activity URLs could not be registered.',
      status: 'failed',
    })

    const field = urlsField(markup)
    expect(field).toContain('data-error="true"')
    expect(field).toContain('Line 1: https://elsewhere.test/one.')
    expect(field).toContain('Contact a Modulus administrator')
  })

  test('renders a server prefix warning against the prefix field', () => {
    const markup = renderForm({
      errors: { url_prefix: [URL_PREFIX_MESSAGES.unsupported_url_components] },
      message: 'Invalid URL prefix.',
      status: 'failed',
    })

    const field = prefixField(markup)
    expect(field).toContain('data-error="true"')
    expect(field).toContain('URL prefixes cannot include query strings or fragments.')
    expect(urlsField(markup)).toContain('data-error="false"')
  })

  test('hides server field errors that describe values the form no longer holds', () => {
    const markup = renderForm(
      {
        errors: { urls: [DENIAL], url_prefix: [URL_PREFIX_MESSAGES.url_too_long] },
        message: 'Some activity URLs could not be registered.',
        status: 'failed',
      },
      { urls: 'https://elsewhere.test/one', url_prefix: 'https://content.test/' }
    )

    expect(urlsField(markup)).toContain('data-error="false"')
    expect(prefixField(markup)).toContain('data-error="false"')
  })

  test('still shows the banner message alongside it', () => {
    const markup = renderForm({
      errors: { urls: [DENIAL] },
      message: 'Some activity URLs could not be registered.',
      status: 'failed',
    })

    expect(markup).toContain('Some activity URLs could not be registered.')
  })

  test('leaves the URL field clean when there is no error', () => {
    const markup = renderForm({ errors: {}, status: 'idle' })

    const field = urlsField(markup)
    expect(field).toContain('data-error="false"')
    expect(field).not.toContain('Contact a Modulus administrator')
  })

  test('does not mark the field in error for a failure that is not about urls', () => {
    const markup = renderForm({
      errors: { description: ['Description must be 1024 characters or fewer.'] },
      message: 'Invalid description.',
      status: 'failed',
    })

    expect(urlsField(markup)).toContain('data-error="false"')
  })

  test('loads grandfathered stored urls without a client-side admission warning', () => {
    mocks.formState = { errors: {}, status: 'idle' }
    const withPrefix = renderToStaticMarkup(
      form(activityCode({ url_prefix: 'http://content.test/course/' }), [
        activity('http://content.test/course/grandfathered'),
      ])
    )

    expect(urlsField(withPrefix)).toContain('data-error="false"')
    expect(prefixField(withPrefix)).toContain('data-error="false"')
    expect(prefixField(withPrefix)).toContain('value="http://content.test/course/"')

    const credentialed = renderToStaticMarkup(
      form(activityCode(), [activity('https://user:secret@content.test/course/legacy')])
    )
    expect(urlsField(credentialed)).toContain('data-error="false"')
  })
})

describe('UpdateActivityCodeForm interaction', () => {
  let container: HTMLDivElement
  let root: Root

  const element = <T extends HTMLElement>(selector: string): T => {
    const found = container.querySelector<T>(selector)
    if (found == null) throw new Error(`missing ${selector}`)
    return found
  }
  const urls = () => element<HTMLTextAreaElement>('textarea[name="urls"]')
  const prefix = () => element<HTMLInputElement>('input[name="url_prefix"]')

  const type = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(
        field,
        value
      )
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(form(activityCode({ url_prefix: 'https://content.test/course/' })))
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test('reports a component warning on the physical line without calling the action', async () => {
    await type(urls(), 'https://content.test/course/a\n\n\nhttps://content.test/course/b#')

    expect(urls().getAttribute('data-error-text')).toBe(
      `Line 4: ${ACTIVITY_URL_MESSAGES.unsupported_url_components}`
    )

    await act(async () => element<HTMLFormElement>('form').requestSubmit())
    expect(mocks.updateActivityCode).not.toHaveBeenCalled()
  })

  test('accepts a spelling variant of a known activity under a canonical prefix variant', async () => {
    await type(prefix(), 'HTTPS://CONTENT.TEST:443/course/')
    await type(urls(), 'HTTPS://Content.Test/course/a')

    expect(urls().getAttribute('data-error')).toBe('false')
    expect(prefix().getAttribute('data-error')).toBe('false')
  })

  test('keeps the entered values through a failed submission', async () => {
    mocks.updateActivityCode.mockResolvedValue({
      errors: { urls: [DENIAL], url_prefix: [URL_PREFIX_MESSAGES.url_too_long] },
      message: 'Some activity URLs could not be registered.',
      status: 'failed',
    })

    const typedPrefix = 'https://Content.test:443/course/'
    const typedUrls = 'HTTPS://CONTENT.TEST/course/a\nhttps://content.test/course/new'
    await type(prefix(), typedPrefix)
    await type(urls(), typedUrls)
    await act(async () => element<HTMLFormElement>('form').requestSubmit())

    expect(mocks.updateActivityCode).toHaveBeenCalledTimes(1)
    expect(urls().getAttribute('data-error-text')).toBe(DENIAL)
    expect(prefix().getAttribute('data-error-text')).toBe(URL_PREFIX_MESSAGES.url_too_long)
    expect(urls().value).toBe(typedUrls)
    expect(prefix().value).toBe(typedPrefix)

    // Editing the prefix hides only the prefix's stale server warning; the
    // warning belongs to the submitted value and returns with it.
    await type(prefix(), 'https://content.test/course/')
    expect(prefix().getAttribute('data-error')).toBe('false')
    expect(urls().getAttribute('data-error-text')).toBe(DENIAL)

    await type(prefix(), typedPrefix)
    expect(prefix().getAttribute('data-error-text')).toBe(URL_PREFIX_MESSAGES.url_too_long)
  })

  test('does not attach a delayed rejection to values edited while it was pending', async () => {
    let respond: (state: ActivityCodeFormState) => void = () => {}
    mocks.updateActivityCode.mockReturnValue(
      new Promise<ActivityCodeFormState>((resolve) => {
        respond = resolve
      })
    )

    await type(prefix(), 'https://content.test/other/')
    await type(urls(), 'https://content.test/other/denied')
    await act(async () => element<HTMLFormElement>('form').requestSubmit())
    expect(mocks.updateActivityCode).toHaveBeenCalledTimes(1)

    // Corrected while the request is still pending.
    await type(urls(), 'https://content.test/other/fixed')
    await type(prefix(), 'https://content.test/')

    await act(async () => {
      respond({
        errors: { urls: [DENIAL], url_prefix: [URL_PREFIX_MESSAGES.url_too_long] },
        message: 'Some activity URLs could not be registered.',
        status: 'failed',
      })
    })

    expect(urls().getAttribute('data-error')).toBe('false')
    expect(prefix().getAttribute('data-error')).toBe('false')
    expect(element<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false)
    expect(urls().value).toBe('https://content.test/other/fixed')
  })
})
