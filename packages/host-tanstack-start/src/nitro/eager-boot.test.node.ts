import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('nitro', () => ({ definePlugin: <T>(plugin: T) => plugin }))

import eagerBoot from './eager-boot'

type Plugin = (app: { fetch: (request: Request) => Promise<Response> }) => void
const plugin = eagerBoot as unknown as Plugin

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('eager boot plugin', () => {
  test('sends one internal boot request and releases its body', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    const fetch = vi.fn(async () => new Response(body))
    plugin({ fetch })
    await flush()
    expect(fetch).toHaveBeenCalledOnce()
    expect(new URL((fetch.mock.calls[0] as unknown as [Request])[0].url).pathname).toBe(
      '/routes/elb-status'
    )
    expect(cancel).toHaveBeenCalled()
  })

  test('a failed boot exits the process in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    plugin({ fetch: async () => new Response('boom', { status: 500 }) })
    await flush()
    expect(exit).toHaveBeenCalledWith(1)
  })

  test('a failed boot only logs in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    plugin({ fetch: async () => Promise.reject(new Error('config')) })
    await flush()
    expect(exit).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })
})
