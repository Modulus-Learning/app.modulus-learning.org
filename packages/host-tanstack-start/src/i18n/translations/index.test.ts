import { describe, expect, test } from 'vitest'

import { createTranslator, getTranslations } from './index'

describe('translations (Start loader)', () => {
  test('namespaced lookup per locale', async () => {
    const en = await getTranslations('en')
    const es = await getTranslations('es')
    expect(en.common.Home).toBe('Home')
    expect(typeof es.common.Home).toBe('string')
  })

  test('an unknown locale falls back to English', async () => {
    expect(await getTranslations('xx' as never)).toBe(await getTranslations('en'))
  })

  test('ICU interpolation (the audited copyright message)', async () => {
    const { t } = await createTranslator('en', 'common')
    expect(t('copyright', { date: 2026 })).toContain('© 2026')
    expect(t('copyright', { date: 2026 })).not.toContain('{')
  })

  test('a missing key returns the key itself from the translator', async () => {
    const { t } = await createTranslator('en', 'common')
    expect(t('no-such-key' as never)).toBe('no-such-key')
  })
})
