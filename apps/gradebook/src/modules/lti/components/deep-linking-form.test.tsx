import { act, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Activity, ActivityCode } from '@/modules/app/activities/@types'
import type { DeepLinkingFormState } from '../@types'

const mocks = vi.hoisted(() => ({ deepLinking: vi.fn() }))

vi.mock('../actions/deep-linking-action', () => ({ deepLinking: mocks.deepLinking }))
vi.mock('./deep-linking-return-form', () => ({
  DeepLinkingReturnForm: ({ jwt }: { jwt: string }) => <p data-testid="return-form">{jwt}</p>,
}))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@/images/logo/modulus-logo-symbol-black.svg', () => ({ default: 'logo.svg' }))
vi.mock('@/config', () => ({
  getPublicConfig: () => ({ publicServerUrl: 'https://modulus.test/' }),
}))

// The real Autocomplete, so selection runs through UIKit and Base UI exactly
// as it does in the browser. Only the code picker is a stand-in: a native
// select is enough to choose a code, and that interaction is not under test.
vi.mock('@infonomic/uikit/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@infonomic/uikit/react')>()
  return {
    ...actual,
    Select: ({
      value,
      onValueChange,
      items,
    }: {
      value?: string | null
      onValueChange?: (value: string | null) => void
      items?: { value: string; label: string }[]
    }) => (
      <select
        data-testid="code-select"
        value={value ?? ''}
        onChange={(event) => onValueChange?.(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">Select</option>
        {items?.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    ),
  }
})

import { ACTIVITY_URL_MESSAGES } from '@/modules/app/activities/@types/validate-urls'
import { DeepLinkingForm } from './deep-linking-form'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const MISMATCH = 'Supply an activity URL matching the configured prefix.'
const INVALID_PREFIX = "Correct this activity code's URL prefix before creating the link."
const COMPONENTS = ACTIVITY_URL_MESSAGES.unsupported_url_components
const SPACE = ACTIVITY_URL_MESSAGES.literal_space
const LAUNCH_ID = 'launch-1'
const TIMESTAMP = '2026-09-04T00:00:00.000Z'

const code = (id: string, name: string, url_prefix: string | null): ActivityCode => ({
  id,
  created_by: null,
  code: name,
  private_code: 'private',
  url_prefix,
  description: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
})

const CODES = [
  // A legacy spelling of `https://content.test/course/`: only a canonical
  // comparison accepts the stored activities below.
  code('019c2d8e-842a-7715-a323-000000000001', 'with-prefix', 'HTTPS://CONTENT.TEST:443/course/'),
  code('019c2d8e-842a-7715-a323-000000000002', 'no-prefix', null),
  // Written before prefixes were validated.
  code(
    '019c2d8e-842a-7715-a323-000000000003',
    'bad-prefix',
    'https://content.test/course/?term=fall'
  ),
  // Also written before prefixes were validated: a space the parser would encode.
  code('019c2d8e-842a-7715-a323-000000000004', 'spaced-prefix', 'https://content.test/my course/'),
]

const activity = (id: string, url: string): Activity => ({
  id,
  url,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
})

const ACTIVITIES: Activity[] = [
  activity('a1', 'https://content.test/course/known'),
  // A grandfathered association that does not satisfy the prefix.
  activity('a2', 'https://content.test/coursework'),
  // A legacy row stored with a raw space before URLs were canonicalized.
  activity('a3', 'https://content.test/course/legacy lesson'),
]

let container: HTMLDivElement
let root: Root

const find = <T extends Element>(selector: string, scope: ParentNode = container): T => {
  const element = scope.querySelector<T>(selector)
  if (element == null) throw new Error(`missing ${selector}`)
  return element
}

const input = () => find<HTMLInputElement>('#activity_url_autocomplete')
const hiddenUrl = () => find<HTMLInputElement>('input[type="hidden"][name="activity_url"]')
const codeSelect = () => find<HTMLSelectElement>('[data-testid="code-select"]')
const submitButton = () => find<HTMLButtonElement>('button[type="submit"]')
const urlError = () =>
  container.querySelector('#error-for-activity_url_autocomplete')?.textContent ?? null
const codeError = () => container.querySelector('#activity_code_id_error')?.textContent ?? null
const text = () => container.textContent ?? ''

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const selectCode = async (name: string) => {
  await act(async () => {
    const select = codeSelect()
    select.value = name
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  // Let the activity list load.
  await flush()
}

const type = async (value: string) => {
  await act(async () => {
    const field = input()
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Dispatches a key on the input; returns whether the default was prevented. */
const key = async (name: string): Promise<boolean> => {
  let prevented = false
  await act(async () => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
    input().dispatchEvent(event)
    prevented = event.defaultPrevented
  })
  return prevented
}

const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
const option = (label: string) => {
  const found = options().find((element) => element.textContent?.includes(label))
  if (found == null) throw new Error(`missing option ${label}`)
  return found
}

const openList = async () => {
  await act(async () => input().focus())
  await key('ArrowDown')
}

/** Clicks an option the way a pointer does. */
const pointerSelect = async (label: string) => {
  await openList()
  await act(async () => {
    const target = option(label)
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** Highlights an option with the arrow keys and commits it with Enter. */
const keyboardSelect = async (label: string) => {
  await openList()
  for (let i = 0; i < options().length; i++) {
    if (option(label).hasAttribute('data-highlighted')) break
    await key('ArrowDown')
  }
  expect(option(label).hasAttribute('data-highlighted')).toBe(true)
  await key('Enter')
}

/**
 * Enter in a text field with no committed list selection: jsdom does not
 * implement implicit submission, so request it when the browser would.
 */
const pressEnterToSubmit = async () => {
  const prevented = await key('Enter')
  expect(prevented).toBe(false)
  await act(async () => find<HTMLFormElement>('form').requestSubmit())
  await flush()
}

const clickSubmit = async () => {
  await act(async () => submitButton().click())
  await flush()
}

const submittedUrl = (call = 0) =>
  (mocks.deepLinking.mock.calls[call]?.[1] as FormData | undefined)?.get('activity_url')

describe('DeepLinkingForm', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ activities: ACTIVITIES }) }))
    )
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<DeepLinkingForm launchId={LAUNCH_ID} activityCodes={CODES} />)
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  describe('while typing', () => {
    test('shows the required prefix and no error for partial or deleted input', async () => {
      await selectCode('with-prefix')
      expect(text()).toContain('Required URL prefix: HTTPS://CONTENT.TEST:443/course/')

      for (const partial of [
        'h',
        'https://',
        'https://elsewhere',
        'https://content.test/course/a?',
        'https://content.test/course/a b',
        '',
      ]) {
        await type(partial)
        expect(urlError()).toBeNull()
        expect(submitButton().disabled).toBe(false)
      }
    })

    test('does not validate when focus moves away from typed input', async () => {
      await selectCode('with-prefix')
      await type('https://elsewhere.test/a#frag')
      await act(async () => {
        input().blur()
        codeSelect().focus()
      })

      expect(urlError()).toBeNull()
      expect(input().value).toBe('https://elsewhere.test/a#frag')
    })

    test('does not validate a merely highlighted suggestion', async () => {
      await selectCode('with-prefix')
      await openList()
      await key('ArrowDown')
      expect(options().some((element) => element.hasAttribute('data-highlighted'))).toBe(true)

      expect(urlError()).toBeNull()
      expect(input().value).toBe('')
    })

    test('compares canonical keys to decide whether a url is new', async () => {
      await selectCode('with-prefix')

      await type('HTTPS://CONTENT.TEST:443/course/known')
      expect(text()).not.toContain('This URL is new')

      await type('https://content.test/course/unseen')
      expect(text()).toContain('This URL is new')

      // Invalid instructor input is never announced as a registrable new URL.
      await type('https://content.test/course/un seen')
      expect(text()).not.toContain('This URL is new')
      expect(urlError()).toBeNull()
    })
  })

  describe('on selection', () => {
    test('accepts a pointer selection that matches a non-canonical prefix spelling', async () => {
      await selectCode('with-prefix')
      await pointerSelect('https://content.test/course/known')

      expect(input().value).toBe('https://content.test/course/known')
      // Validated with the selected value: stale empty state would say the
      // field is required.
      expect(urlError()).toBeNull()

      mocks.deepLinking.mockResolvedValue({ errors: {}, status: 'idle' })
      await clickSubmit()
      expect(submittedUrl()).toBe('https://content.test/course/known')
    })

    test('reports a prefix mismatch for a keyboard selection, using the selected value', async () => {
      await selectCode('with-prefix')
      await keyboardSelect('https://content.test/coursework')

      expect(input().value).toBe('https://content.test/coursework')
      expect(urlError()).toBe(MISMATCH)
      expect(submitButton().disabled).toBe(true)
    })

    test('reports a prefix mismatch for a pointer selection, then accepts a corrected one', async () => {
      await selectCode('with-prefix')
      await pointerSelect('https://content.test/coursework')
      expect(urlError()).toBe(MISMATCH)

      await type('')
      expect(urlError()).toBeNull()
      await keyboardSelect('https://content.test/course/known')
      expect(urlError()).toBeNull()
    })

    test.each([
      ['pointer', pointerSelect],
      ['keyboard', keyboardSelect],
    ] as const)(
      'reports a literal space for a %s selection, then accepts a corrected value',
      async (_, select) => {
        mocks.deepLinking.mockResolvedValue({ errors: {}, status: 'idle' })
        await selectCode('no-prefix')
        await select('https://content.test/course/legacy lesson')

        expect(input().value).toBe('https://content.test/course/legacy lesson')
        expect(urlError()).toBe(SPACE)
        expect(urlError()).not.toMatch(/administrator|request access/i)
        expect(submitButton().disabled).toBe(true)

        await type('https://content.test/course/legacy%20lesson')
        expect(urlError()).toBeNull()
        await clickSubmit()
        expect(mocks.deepLinking).toHaveBeenCalledTimes(1)
        expect(submittedUrl()).toBe('https://content.test/course/legacy%20lesson')
      }
    )

    test('attributes a loaded prefix with a literal space to the activity code', async () => {
      await selectCode('spaced-prefix')
      await pointerSelect('https://content.test/course/known')

      expect(codeError()).toBe(INVALID_PREFIX)
      expect(urlError()).toBeNull()
    })

    test('attributes an invalid loaded prefix to the activity code', async () => {
      await selectCode('bad-prefix')
      await pointerSelect('https://content.test/course/known')

      expect(codeError()).toBe(INVALID_PREFIX)
      expect(urlError()).toBeNull()

      // Typing does not fix the code's prefix; choosing another code does.
      await type('https://content.test/course/other')
      expect(codeError()).toBe(INVALID_PREFIX)
      await selectCode('no-prefix')
      expect(codeError()).toBeNull()
    })
  })

  describe('on submit', () => {
    test('submits a manually typed canonical-prefix equivalent via Enter without selecting', async () => {
      mocks.deepLinking.mockResolvedValue({ errors: {}, status: 'idle' })
      await selectCode('with-prefix')
      await type('https://Content.Test/course/typed')
      await pressEnterToSubmit()

      expect(mocks.deepLinking).toHaveBeenCalledTimes(1)
      expect(submittedUrl()).toBe('https://Content.Test/course/typed')
    })

    test.each([
      ['with-prefix', 'https://content.test/course/lesson?x=1', COMPONENTS],
      ['with-prefix', 'https://content.test/course/lesson#', COMPONENTS],
      ['with-prefix', 'https://elsewhere.test/lesson', MISMATCH],
      ['no-prefix', 'https://content.test/lesson?', COMPONENTS],
      ['no-prefix', 'not-a-url', ACTIVITY_URL_MESSAGES.malformed_url],
      ['no-prefix', 'https://content.test/lesson one', SPACE],
      ['no-prefix', '  https://content.test/lesson one  ', SPACE],
      ['no-prefix', 'https://content.test/one https://content.test/two', SPACE],
      ['with-prefix', 'https://content.test/course/lesson one?x=1', SPACE],
      ['no-prefix', '', ACTIVITY_URL_MESSAGES.required],
    ])('with %s, blocks %j and never invokes the action', async (codeName, value, message) => {
      await selectCode(codeName)
      await type(value)
      await pressEnterToSubmit()

      expect(urlError()).toBe(message)
      expect(urlError()).not.toMatch(/administrator|request access/i)
      expect(input().value).toBe(value)
      expect(mocks.deepLinking).not.toHaveBeenCalled()
    })

    test('submits a manually typed %20 url via Enter', async () => {
      mocks.deepLinking.mockResolvedValue({ errors: {}, status: 'idle' })
      await selectCode('with-prefix')
      await type('https://content.test/course/lesson%20one')
      await pressEnterToSubmit()

      expect(urlError()).toBeNull()
      expect(submittedUrl()).toBe('https://content.test/course/lesson%20one')
    })

    test('blocks submission for a loaded prefix with a literal space, even for a %20 url', async () => {
      await selectCode('spaced-prefix')
      await type('https://content.test/my%20course/lesson')
      await pressEnterToSubmit()

      expect(codeError()).toBe(INVALID_PREFIX)
      expect(urlError()).toBeNull()
      expect(mocks.deepLinking).not.toHaveBeenCalled()
    })

    test('blocks submission for an invalid loaded prefix', async () => {
      await selectCode('bad-prefix')
      await type('https://content.test/course/lesson')
      await pressEnterToSubmit()

      expect(codeError()).toBe(INVALID_PREFIX)
      expect(urlError()).toBeNull()
      expect(mocks.deepLinking).not.toHaveBeenCalled()
    })

    test('blocks submission without a code', async () => {
      await act(async () => find<HTMLFormElement>('form').requestSubmit())

      expect(codeError()).toBe('Select an activity code.')
      expect(mocks.deepLinking).not.toHaveBeenCalled()
    })

    test('corrects a local error and resubmits', async () => {
      mocks.deepLinking.mockResolvedValue({ errors: {}, status: 'idle' })
      await selectCode('no-prefix')
      await type('https://content.test/lesson#top')
      await pressEnterToSubmit()
      expect(urlError()).toBe(COMPONENTS)

      await type('https://content.test/lesson')
      expect(urlError()).toBeNull()
      await pressEnterToSubmit()

      expect(mocks.deepLinking).toHaveBeenCalledTimes(1)
      expect(submittedUrl()).toBe('https://content.test/lesson')
    })
  })

  describe('server responses', () => {
    const failure = (errors: DeepLinkingFormState['errors'], message: string) => ({
      errors,
      message,
      status: 'failed' as const,
    })

    test('shows a server prefix mismatch, preserves input and code, and resubmits once corrected', async () => {
      mocks.deepLinking.mockResolvedValueOnce(
        failure({ activity_url: [MISMATCH] }, 'Invalid activity URL.')
      )
      mocks.deepLinking.mockResolvedValueOnce({
        status: 'success',
        result: { jwt: 'signed-jwt', return_url: 'https://canvas.test/return' },
      })

      await selectCode('no-prefix')
      await type('https://content.test/course/typed')
      await clickSubmit()

      expect(urlError()).toBe(MISMATCH)
      expect(input().value).toBe('https://content.test/course/typed')
      expect(hiddenUrl().value).toBe('https://content.test/course/typed')
      expect(codeSelect().value).toBe('no-prefix')
      expect(submitButton().disabled).toBe(true)

      // The stale server error neither survives the edit nor blocks resubmission.
      await type('https://content.test/course/fixed')
      expect(urlError()).toBeNull()
      expect(submitButton().disabled).toBe(false)

      await clickSubmit()
      expect(submittedUrl(1)).toBe('https://content.test/course/fixed')
      expect(find('[data-testid="return-form"]').textContent).toBe('signed-jwt')
    })

    test('shows a server literal-space warning, preserves input, and resubmits once corrected', async () => {
      mocks.deepLinking.mockResolvedValueOnce(
        failure({ activity_url: [SPACE] }, 'Invalid activity URL.')
      )
      mocks.deepLinking.mockResolvedValueOnce({ errors: {}, status: 'idle' })

      await selectCode('no-prefix')
      await type('https://content.test/lesson')
      await clickSubmit()

      expect(urlError()).toBe(SPACE)
      expect(input().value).toBe('https://content.test/lesson')
      expect(codeSelect().value).toBe('no-prefix')
      expect(submitButton().disabled).toBe(true)

      await type('https://content.test/lesson%20one')
      expect(urlError()).toBeNull()
      expect(submitButton().disabled).toBe(false)
      await clickSubmit()
      expect(submittedUrl(1)).toBe('https://content.test/lesson%20one')
    })

    test('shows a server invalid-prefix error on the code, not the url', async () => {
      mocks.deepLinking.mockResolvedValue(
        failure({ activity_code_id: [INVALID_PREFIX] }, 'Invalid activity code.')
      )

      await selectCode('no-prefix')
      await type('https://content.test/lesson')
      await clickSubmit()

      expect(codeError()).toBe(INVALID_PREFIX)
      expect(urlError()).toBeNull()
      expect(input().value).toBe('https://content.test/lesson')
      expect(codeSelect().value).toBe('no-prefix')

      // Still shown while the URL is edited; cleared when the code changes.
      await type('https://content.test/lesson-2')
      expect(codeError()).toBe(INVALID_PREFIX)
      await selectCode('with-prefix')
      expect(codeError()).toBeNull()
    })

    test.each([
      ['the url', { activity_url: [MISMATCH] }, 'Invalid activity URL.'],
      ['the code', { activity_code_id: [INVALID_PREFIX] }, 'Invalid activity code.'],
    ] as [string, DeepLinkingFormState['errors'], string][])(
      'does not attach a delayed rejection after %s changed while pending',
      async (_, errors, message) => {
        let respond: (state: DeepLinkingFormState) => void = () => {}
        mocks.deepLinking.mockReturnValueOnce(
          new Promise<DeepLinkingFormState>((resolve) => {
            respond = resolve
          })
        )
        mocks.deepLinking.mockResolvedValueOnce({ errors: {}, status: 'idle' })

        await selectCode('no-prefix')
        await type('https://content.test/course/typed')
        await clickSubmit()
        expect(mocks.deepLinking).toHaveBeenCalledTimes(1)

        // Corrected while the request is still pending.
        if (errors?.activity_url != null) {
          await type('https://content.test/course/fixed')
        } else {
          await selectCode('with-prefix')
          await type('https://content.test/course/fixed')
        }

        await act(async () => respond(failure(errors, message)))
        await flush()

        expect(urlError()).toBeNull()
        expect(codeError()).toBeNull()
        expect(input().value).toBe('https://content.test/course/fixed')
        expect(submitButton().disabled).toBe(false)

        await clickSubmit()
        expect(mocks.deepLinking).toHaveBeenCalledTimes(2)
        expect(submittedUrl(1)).toBe('https://content.test/course/fixed')
      }
    )
  })
})
