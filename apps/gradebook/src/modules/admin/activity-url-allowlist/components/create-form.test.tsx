import { createElement, type ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

// Stand-ins for the design-system pieces the copy components render into. The
// subject here is the wording, not the chrome around it.
vi.mock('@infonomic/uikit/react', () => ({
  Alert: ({ children, intent }: { children?: ReactNode; intent?: string }) =>
    createElement('div', { role: 'alert', 'data-intent': intent }, children),
  Button: ({ children }: { children?: ReactNode }) =>
    createElement('button', { type: 'button' }, children),
}))

import {
  allowlistRuleCreateSchema,
  allowlistRuleDeleteSchema,
  allowlistRuleEditSchema,
} from '../@types'
import { ALLOWLIST_COPY, CollisionNotice, DenyAllEmptyState, GrandfatheringNotice } from './copy'
import type { AllowlistRule } from '../@types'

const rule = (overrides: Partial<AllowlistRule> = {}): AllowlistRule => ({
  id: '019c2d8e-842a-7715-a323-a7e31427db2d',
  base_url: 'https://ximera.example/course/calculus',
  origin: 'https://ximera.example',
  path_prefix: '/course/calculus',
  description: null,
  is_enabled: true,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-04T00:00:00.000Z',
  updated_at: '2026-09-04T00:00:00.000Z',
  ...overrides,
})

const render = (element: React.JSX.Element): string => renderToStaticMarkup(element)

/** Markup with tags stripped, so assertions read against the visible sentence. */
const text = (element: React.JSX.Element): string =>
  render(element)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

describe('deny-all empty state', () => {
  // The mitigation for "deny-all surprises a new operator". Its absence is a
  // defect, not a cosmetic gap: a seeded database starts in this state, and an
  // operator who does not understand why nothing registers has no way to find
  // out from the UI.
  test('says no rules exist and that no new URL can be registered', () => {
    const rendered = text(<DenyAllEmptyState />)

    expect(rendered).toContain('No allowlist rules exist')
    expect(rendered).toContain('no new activity URLs can be registered')
    expect(rendered).toContain('refusing to register')
  })

  test('says where the first rule comes from, and that seeds create none', () => {
    const rendered = text(<DenyAllEmptyState />)

    expect(rendered).toContain('A developer or operator adds the first rule here')
    expect(rendered).toContain('seeds create no rules')
  })
})

describe('grandfathering notice', () => {
  test('renders the change warning verbatim', () => {
    const rendered = text(<GrandfatheringNotice />)

    expect(rendered).toContain(
      'This change stops previously unseen URLs under this base URL from being registered.'
    )
    expect(rendered).toContain(
      'Existing activities will continue to work and may still be added to activity codes or used in new deep links.'
    )
  })

  test('calls the affected activities grandfathered, and counts them', () => {
    const rendered = text(
      <GrandfatheringNotice
        impact={{ total_activities: 12, grandfathered_count: 4, grandfathered_sample: [] }}
      />
    )

    expect(rendered).toContain('4 of 12')
    expect(rendered).toContain('grandfathered')
    expect(rendered).toContain('They keep working.')
  })

  test('never calls an activity blocked, disabled, invalid or noncompliant', () => {
    // The vocabulary is the contract. An activity outside the policy is
    // grandfathered; describing it any of these other ways tells an
    // administrator that removing a rule revoked access, which it did not.
    const rendered = text(
      <GrandfatheringNotice
        impact={{ total_activities: 12, grandfathered_count: 4, grandfathered_sample: [] }}
      />
    ).toLowerCase()

    expect(rendered).not.toContain('block')
    expect(rendered).not.toContain('disabled activity')
    expect(rendered).not.toContain('invalid')
    expect(rendered).not.toContain('noncompliant')
  })

  test('keeps that vocabulary out of the empty state too', () => {
    const rendered = text(<DenyAllEmptyState />).toLowerCase()

    expect(rendered).not.toContain('block')
    expect(rendered).not.toContain('disabled activity')
  })
})

describe('collision outcomes', () => {
  test('renders already_enabled as informational, not as an error', () => {
    const element = <CollisionNotice status="already_enabled" existing={rule()} />

    expect(render(element)).toContain('data-intent="info"')
    expect(render(element)).not.toContain('data-intent="danger"')

    const rendered = text(element)
    expect(rendered).toContain('already exists and is enabled')
    expect(rendered).toContain('Nothing was changed.')
    expect(rendered).not.toMatch(/error|failed/i)
  })

  test('renders disabled_match as informational, with its description and a re-enable action', () => {
    const existing = rule({ is_enabled: false, description: 'approved for the pilot' })
    const element = (
      <CollisionNotice
        status="disabled_match"
        existing={existing}
        action={<button type="button">Re-enable this rule</button>}
      />
    )

    expect(render(element)).toContain('data-intent="info"')

    const rendered = text(element)
    expect(rendered).toContain('already exists but is currently disabled')
    expect(rendered).toContain('Nothing was changed.')
    // Re-enabling goes through the update command, which is what preserves
    // these -- so the notice has to show them.
    expect(rendered).toContain('approved for the pilot')
    expect(rendered).toContain('keeps its description and its original author')
    expect(rendered).toContain('Re-enable this rule')
    expect(rendered).not.toMatch(/error|failed/i)
  })

  test('shows the colliding base URL, so the normalization is visible', () => {
    // The submission that collided was spelled differently; showing the stored
    // base URL is how the administrator sees why it collided.
    const rendered = text(<CollisionNotice status="already_enabled" existing={rule()} />)

    expect(rendered).toContain('https://ximera.example/course/calculus')
  })
})

describe('copy constants', () => {
  test('are the single source for the required wording', () => {
    expect(ALLOWLIST_COPY.changeWarning).toBe(
      'This change stops previously unseen URLs under this base URL from being registered. Existing activities will continue to work and may still be added to activity codes or used in new deep links.'
    )
    expect(ALLOWLIST_COPY.grandfatheredLabel).toBe('grandfathered')
  })
})

/**
 * The component-to-action boundary.
 *
 * Each case builds the `FormData` the component actually sends and parses it
 * exactly as the server action does -- through `formData.get(...)`, because the
 * null-vs-undefined distinction there is the whole point. A schema that only
 * ever sees hand-written object literals cannot catch a form that omits a key.
 */
describe('form submissions parse against their action schemas', () => {
  const RULE_ID = '019c2d8e-842a-7715-a323-a7e31427db2d'

  test('the re-enable button leaves the description alone', () => {
    // What ReEnableRuleButton sends: id and is_enabled, nothing else.
    const formData = new FormData()
    formData.append('id', RULE_ID)
    formData.append('is_enabled', 'true')

    const parsed = allowlistRuleEditSchema.safeParse({
      id: formData.get('id'),
      description: formData.get('description') ?? undefined,
      is_enabled: formData.get('is_enabled'),
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.is_enabled).toBe(true)
    // Undefined, never '' -- core leaves an undefined description untouched,
    // which is what the collision notice promises about re-enabling.
    expect(parsed.success && parsed.data.description).toBeUndefined()
  })

  test('the edit form sends all three fields', () => {
    const formData = new FormData()
    formData.append('id', RULE_ID)
    formData.append('description', 'approved for the pilot')
    formData.append('is_enabled', 'false')

    const parsed = allowlistRuleEditSchema.safeParse({
      id: formData.get('id'),
      description: formData.get('description') ?? undefined,
      is_enabled: formData.get('is_enabled'),
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.description).toBe('approved for the pilot')
    expect(parsed.success && parsed.data.is_enabled).toBe(false)
  })

  test('the delete form sends the id and the base URL', () => {
    const formData = new FormData()
    formData.append('id', RULE_ID)
    formData.append('base_url', 'https://ximera.example/course/calculus')

    const parsed = allowlistRuleDeleteSchema.safeParse({
      id: formData.get('id'),
      base_url: formData.get('base_url'),
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.base_url).toBe('https://ximera.example/course/calculus')
  })

  test('the create form sends a base URL and a possibly empty description', () => {
    const formData = new FormData()
    formData.append('base_url', 'https://ximera.example/course/calculus')
    formData.append('description', '')

    const parsed = allowlistRuleCreateSchema.safeParse({
      base_url: formData.get('base_url'),
      description: formData.get('description'),
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.base_url).toBe('https://ximera.example/course/calculus')
  })
})
