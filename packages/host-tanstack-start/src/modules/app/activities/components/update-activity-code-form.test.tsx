import { createElement, type ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

import type { ActivityCodeFormState } from '../@types'

const mocks = vi.hoisted(() => ({
  formState: { errors: {}, status: 'idle' } as ActivityCodeFormState,
}))

// `useActionState` is what carries the server action's result back into the
// form, so driving it directly is how a given form state can be rendered.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: () => [mocks.formState, () => {}, false],
  }
})

// Stand-ins that surface the props under test as attributes.
vi.mock('@infonomic/uikit/react', () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement('button', { type: 'button' }, children),
  ErrorText: ({ text }: { text?: string }) => createElement('p', { 'data-testid': 'banner' }, text),
  Input: ({ errorText }: { errorText?: string }) =>
    createElement('input', { 'data-error-text': errorText }),
  TextArea: ({ name, error, errorText }: { name?: string; error?: boolean; errorText?: string }) =>
    createElement('textarea', {
      name,
      'data-error': String(Boolean(error)),
      'data-error-text': errorText,
    }),
}))

vi.mock('@/i18n/components/lang-link', () => ({
  LangLink: ({ children }: { children?: ReactNode }) => createElement('a', {}, children),
}))
vi.mock('../update-activity-code', () => ({ updateActivityCode: () => {} }))

import { UpdateActivityCodeForm } from './update-activity-code-form'

const TIMESTAMP = '2026-09-04T00:00:00.000Z'

const DENIAL =
  'This Modulus site does not allow these activity URLs: https://elsewhere.test/one. Contact a Modulus administrator to request access.'

const renderForm = (formState: ActivityCodeFormState): string => {
  mocks.formState = formState
  return renderToStaticMarkup(
    <UpdateActivityCodeForm
      lng="en"
      activityCode={{
        id: '019c2d8e-842a-7715-a323-a7e31427db2d',
        created_by: '019c2d8e-842a-7715-a323-a7e31427db2f',
        code: 'brave-otter',
        private_code: 'private',
        url_prefix: null,
        description: null,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      }}
      activities={[
        {
          id: '019c2d8e-842a-7715-a323-a7e31427db2e',
          url: 'https://content.test/a',
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
        },
      ]}
    />
  )
}

/** The URLs textarea, as rendered by the stand-in above. */
const urlsField = (markup: string): string =>
  markup.match(/<textarea[^>]*name="urls"[^>]*>/)?.[0] ?? ''

describe('UpdateActivityCodeForm url errors', () => {
  test('renders a server url denial against the URL field, not only in the banner', () => {
    // The instructor has to know which lines to change; a banner alone leaves
    // them hunting through the textarea.
    const markup = renderForm({
      errors: { urls: [DENIAL] },
      message: 'Some activity URLs are not allowed.',
      status: 'failed',
    })

    const field = urlsField(markup)
    expect(field).toContain('data-error="true"')
    expect(field).toContain('https://elsewhere.test/one')
    expect(field).toContain('Contact a Modulus administrator')
  })

  test('still shows the banner message alongside it', () => {
    const markup = renderForm({
      errors: { urls: [DENIAL] },
      message: 'Some activity URLs are not allowed.',
      status: 'failed',
    })

    expect(markup).toContain('Some activity URLs are not allowed.')
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
})
