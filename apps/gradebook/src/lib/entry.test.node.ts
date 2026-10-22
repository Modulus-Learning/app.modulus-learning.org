import { describe, expect, test, vi } from 'vitest'

import { createEntryHandler, type EntryLogger } from '@/lib/entry'
import { annotateRequest, getRequestScope } from '@/lib/request-scope'
import { createInFlightTracker } from '@/lib/shutdown'
import type { DeploymentMode } from '@/lib/deployment-mode'

const BASE = 'https://modulus.test'

const setup = (mode: DeploymentMode, next?: (request: Request) => Promise<Response>) => {
  const lines: Array<{ level: string; line: Record<string, unknown> }> = []
  const logger: EntryLogger = {
    info: (line) => lines.push({ level: 'info', line: line as Record<string, unknown> }),
    warn: (line) => lines.push({ level: 'warn', line: line as Record<string, unknown> }),
    error: (line) => lines.push({ level: 'error', line: line as Record<string, unknown> }),
  }
  const router = vi.fn(next ?? (async () => new Response('ok')))
  const handle = createEntryHandler({ mode, logger }, router)
  return { handle, router, lines }
}

const get = (path: string, init?: RequestInit) => new Request(`${BASE}${path}`, init)

describe('server entry: deployment-mode gate and redirects', () => {
  test('admin instance: apex → 307 /admin/sign-in, router not called', async () => {
    const { handle, router } = setup('admin')
    for (const path of ['/', '/es']) {
      const response = await handle(get(path))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('/admin/sign-in')
    }
    expect(router).not.toHaveBeenCalled()
  })

  test('admin instance: frontend paths → 404 without reading the body', async () => {
    const { handle, router } = setup('admin')
    const request = new Request(`${BASE}/routes/lti/launch`, {
      method: 'POST',
      body: new URLSearchParams({ id_token: 'x', state: 'y' }),
    })
    const response = await handle(request)
    expect(response.status).toBe(404)
    expect(request.bodyUsed).toBe(false)
    for (const path of ['/sign-in', '/lti/error', '/agent/error', '/routes/agent/token']) {
      expect((await handle(get(path))).status).toBe(404)
    }
    expect(router).not.toHaveBeenCalled()
  })

  test('frontend instance: admin paths → 404', async () => {
    const { handle, router } = setup('frontend')
    for (const path of ['/admin', '/es/admin/users', '/routes/admin/refresh']) {
      expect((await handle(get(path))).status).toBe(404)
    }
    expect(router).not.toHaveBeenCalled()
  })

  test.each<DeploymentMode>(['frontend', 'admin'])(
    '%s instance: neutral paths reach the router',
    async (mode) => {
      const { handle, router } = setup(mode)
      for (const path of [
        '/routes/elb-status',
        '/_serverFn/abc',
        '/_build/x.js',
        '/fonts/a.woff2',
      ]) {
        expect((await handle(get(path))).status).toBe(200)
      }
      expect(router).toHaveBeenCalledTimes(4)
    }
  )

  test.each(['/https://activity.test/page', '/https:/activity.test/page'])(
    'activity path %s → 307 /start-activity/…',
    async (path) => {
      const { handle, router } = setup('all-in-one')
      const response = await handle(get(path))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(`/start-activity${path}`)
      expect(router).not.toHaveBeenCalled()
    }
  )

  test('a /start-activity path is not redirected again', async () => {
    const { handle, router } = setup('all-in-one')
    await handle(get('/start-activity/code/https://activity.test/page'))
    expect(router).toHaveBeenCalledOnce()
  })

  test('the locale slot runs after the gate and may answer the request', async () => {
    const lines: unknown[] = []
    const logger = { info: (l: unknown) => lines.push(l), warn: () => {}, error: () => {} }
    const handle = createEntryHandler(
      {
        mode: 'all-in-one',
        logger,
        negotiateLocale: (request) =>
          new URL(request.url).pathname === '/sign-in'
            ? Response.redirect(`${BASE}/es/sign-in`, 302)
            : null,
      },
      async () => new Response('ok')
    )
    expect((await handle(get('/sign-in'))).status).toBe(302)
    expect((await handle(get('/about'))).status).toBe(200)
  })
})

describe('server entry: access log coverage', () => {
  test('exactly one line per request, with handler_type, for every response shape', async () => {
    const { handle, lines } = setup('admin', async (request) => {
      const { pathname } = new URL(request.url)
      if (pathname.startsWith('/_serverFn')) {
        annotateRequest({ handlerType: 'serverFn', serverFn: 'renewAdminSession' })
      } else if (pathname.startsWith('/routes/')) {
        annotateRequest({ handlerType: 'handler' })
      } else {
        annotateRequest({ handlerType: 'ssr', route: '/$lng/_admin/admin/users' })
      }
      return new Response('ok')
    })

    await handle(get('/sign-in')) // blocked → entry 404
    await handle(get('/')) // apex redirect → entry 307
    await handle(get('/admin/users')) // ssr
    await handle(get('/routes/admin/refresh')) // handler
    await handle(get('/_serverFn/abc', { method: 'POST' })) // server fn

    expect(lines.map(({ line }) => [line.handler_type, line.status])).toEqual([
      ['entry', 404],
      ['entry', 307],
      ['ssr', 200],
      ['handler', 200],
      ['serverFn', 200],
    ])
    expect(lines[2].line.route).toBe('/$lng/_admin/admin/users')
    expect(lines[4].line.server_fn).toBe('renewAdminSession')
    expect(lines[0].level).toBe('warn')
    for (const { line } of lines) {
      expect(line.mode).toBe('admin')
      expect(typeof line.request_id).toBe('string')
      expect(typeof line.duration_ms).toBe('number')
    }
  })

  test('never logs a query string, body or cookie', async () => {
    const { handle, lines } = setup('all-in-one')
    await handle(
      get('/routes/agent/authorize?code=secret-code&state=secret-state', {
        headers: { cookie: 'user_session=secret-cookie', authorization: 'Bearer secret-token' },
      })
    )
    await handle(
      new Request(`${BASE}/routes/lti/launch`, {
        method: 'POST',
        body: new URLSearchParams({ id_token: 'secret-id-token' }),
      })
    )
    const serialised = JSON.stringify(lines)
    for (const secret of [
      'secret-code',
      'secret-state',
      'secret-cookie',
      'secret-token',
      'secret-id-token',
      '?',
    ]) {
      expect(serialised).not.toContain(secret)
    }
  })

  test('health probes are not logged', async () => {
    const { handle, lines } = setup('all-in-one')
    await handle(get('/routes/elb-status'))
    await handle(get('/routes/keep-alive'))
    expect(lines).toEqual([])
  })

  test('a thrown error is logged as 500 and rethrown; a thrown Response is returned', async () => {
    const failing = setup('all-in-one', async () => {
      throw new Error('boom')
    })
    await expect(failing.handle(get('/about'))).rejects.toThrow('boom')
    expect(failing.lines.map(({ level, line }) => [level, line.status])).toEqual([['error', 500]])

    const thrown = setup('all-in-one', async () => {
      throw new Response(null, { status: 303, headers: { location: '/x' } })
    })
    expect((await thrown.handle(get('/about'))).status).toBe(303)
    expect(thrown.lines[0].line.status).toBe(303)
  })

  test('the router runs inside the request scope', async () => {
    let seen: string | undefined
    const { handle, lines } = setup('all-in-one', async () => {
      seen = getRequestScope()?.requestId
      return new Response('ok')
    })
    await handle(get('/about'))
    expect(seen).toBeDefined()
    expect(lines[0].line.request_id).toBe(seen)
    expect(getRequestScope()).toBeUndefined()
  })
})

describe('server entry: in-flight tracking', () => {
  const logger: EntryLogger = { info: () => {}, warn: () => {}, error: () => {} }

  test('a request counts as in flight until its handler settles', async () => {
    const inFlight = createInFlightTracker()
    let release: (response: Response) => void = () => {}
    const handle = createEntryHandler(
      { mode: 'all-in-one', logger, inFlight },
      () => new Promise<Response>((resolve) => (release = resolve))
    )
    const pending = handle(get('/about'))
    expect(inFlight.count).toBe(1)
    release(new Response('ok'))
    await pending
    expect(inFlight.count).toBe(0)
  })

  test('a handler that throws still settles', async () => {
    const inFlight = createInFlightTracker()
    const handle = createEntryHandler({ mode: 'all-in-one', logger, inFlight }, async () => {
      throw new Error('boom')
    })
    await expect(handle(get('/about'))).rejects.toThrow('boom')
    expect(inFlight.count).toBe(0)
  })
})

describe('server entry: same-origin redirects become relative', () => {
  // Behind nginx (and Fly's TLS edge) Node sees `http://` and the proxied Host,
  // so an absolute same-origin Location would carry the wrong scheme or port.
  test('a same-origin absolute Location is rewritten to its path', async () => {
    const { handle } = setup('all-in-one', async () =>
      Response.redirect(`${BASE}/lti/error?code=invalid_request`, 303)
    )
    const response = await handle(get('/routes/lti/login'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/lti/error?code=invalid_request')
  })

  test('entry redirects (admin apex) are relative too', async () => {
    const { handle } = setup('admin')
    const response = await handle(get('/'))
    expect(response.headers.get('location')).toBe('/admin/sign-in')
  })

  test('a cross-origin Location is left alone', async () => {
    const { handle } = setup('all-in-one', async () =>
      Response.redirect('https://canvas.test/login/oauth2/auth?x=1', 302)
    )
    const response = await handle(get('/routes/lti/login'))
    expect(response.headers.get('location')).toBe('https://canvas.test/login/oauth2/auth?x=1')
  })
})
