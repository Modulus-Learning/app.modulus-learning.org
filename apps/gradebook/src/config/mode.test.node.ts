import { initCore } from '@modulus-learning/core'
import { loadCoreConfigFromEnv } from '@modulus-learning/core/env'
import { pino } from 'pino'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ADMIN_ENV, envForMode, FRONTEND_ENV, type Mode } from './fixtures/mode-env'
import { parseServerConfig } from './index'

const without = (env: Record<string, string>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(env).filter(([key]) => !keys.includes(key)))

describe('mode-aware server config', () => {
  test.each<Mode>(['all-in-one', 'frontend', 'admin'])(
    '%s parses with its permitted env',
    (mode) => {
      const config = parseServerConfig(envForMode(mode))
      expect(config.deployment.mode).toBe(mode)
      expect(config.cookies.flash.name).toBe('flash')
    }
  )

  test('frontend does not require admin settings, and reaching them throws', () => {
    const env = envForMode('frontend')
    for (const key of Object.keys(ADMIN_ENV)) expect(env).not.toHaveProperty(key)

    const config = parseServerConfig(env)
    expect(config.cookies.userSession.name).toBe('user_session')
    expect(() => config.cookies.adminSession.name).toThrow(
      /cookies\.adminSession\.name is not configured: DEPLOYMENT_MODE=frontend does not serve the admin surface/
    )
  })

  test('admin does not require learner settings, and reaching them throws', () => {
    const env = envForMode('admin')
    for (const key of Object.keys(FRONTEND_ENV).filter((k) => !k.startsWith('API_JWT_'))) {
      expect(env).not.toHaveProperty(key)
    }

    const config = parseServerConfig(env)
    expect(config.cookies.adminSession.name).toBe('admin_session')
    expect(() => config.cookies.userSession.name).toThrow(/does not serve the frontend surface/)
    expect(() => config.oauth.google).toThrow(/oauth\.google is not configured/)
    expect(() => config.recaptcha.enabled).toThrow(/recaptcha\.enabled is not configured/)
    expect(() => config.lti.launchInterstitial).toThrow(/lti\.launchInterstitial/)
    expect(() => config.api.baseUrl).toThrow(/api\.baseUrl/)
  })

  test('a stand-in section survives serialisation and promise checks', () => {
    const config = parseServerConfig(envForMode('admin'))
    expect(() => JSON.stringify(config)).not.toThrow()
    expect((config.oauth as unknown as { then?: unknown }).then).toBeUndefined()
  })

  test.each([
    ['all-in-one', 'ADMIN_SESSION_COOKIE_NAME'],
    ['all-in-one', 'OAUTH_GOOGLE_CLIENT_ID'],
    ['frontend', 'USER_SESSION_COOKIE_NAME'],
    ['frontend', 'OAUTH_GITHUB_CLIENT_ID'],
    ['admin', 'ADMIN_REFRESH_COOKIE_NAME'],
    ['admin', 'FLASH_COOKIE_NAME'],
    ['frontend', 'SMTP_HOST'],
  ] as const)('%s fails without %s', (mode, key) => {
    expect(() => parseServerConfig(without(envForMode(mode), key))).toThrow()
  })

  test('frontend rejects JOB_QUEUE_ENABLED=true', () => {
    expect(() =>
      parseServerConfig({ ...envForMode('frontend'), JOB_QUEUE_ENABLED: 'true' })
    ).toThrow(/DEPLOYMENT_MODE=frontend requires JOB_QUEUE_ENABLED=false/)
  })

  test('an invalid DEPLOYMENT_MODE fails', () => {
    expect(() =>
      parseServerConfig({ ...envForMode('admin'), DEPLOYMENT_MODE: 'backend' })
    ).toThrow()
  })
})

describe('per-mode boot: host config and core initialise with only the permitted env', () => {
  let saved: NodeJS.ProcessEnv

  beforeEach(() => {
    saved = { ...process.env }
  })

  afterEach(() => {
    process.env = saved
  })

  test.each<Mode>(['all-in-one', 'frontend', 'admin'])('%s', async (mode) => {
    // Replace the whole environment so nothing outside the permitted set leaks in.
    process.env = { NODE_ENV: 'test', ...envForMode(mode) }

    const config = parseServerConfig()
    const core = await initCore({
      pinoLogger: pino({ level: 'silent' }),
      config: loadCoreConfigFromEnv(process.env),
      urlBuilder: {
        baseUrl: config.publicServerUrl,
        ltiLaunchUrl: `${config.publicServerUrl}/routes/lti/launch`,
        dashboardUrl: `${config.publicServerUrl}/dashboard`,
      },
    })

    expect(core.commands.app).toBeDefined()
    expect(core.commands.admin).toBeDefined()
    expect(core.commands.agent).toBeDefined()
  })
})
