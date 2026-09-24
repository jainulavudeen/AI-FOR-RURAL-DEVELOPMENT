import Fastify from 'fastify'
import { describe, it, expect } from 'vitest'
import corsPlugin from './cors.js'

// Regression coverage for: "Partner Dashboard edits don't save — any
// change shows 'Couldn't save, please try again'." Root cause was
// @fastify/cors's default `methods` list ('GET,HEAD,POST' — narrower than
// the plain `cors` npm package's default), which apps/api/src/plugins/
// cors.ts never overrode. PATCH /feedback/appeals/:id (the officer's save
// action, and the only non-GET/POST route in the whole API) failed its
// CORS preflight in a real browser and never reached the server at all —
// curl-based testing missed this entirely because curl doesn't enforce
// CORS. This test drives a real preflight through the actual plugin.
describe('CORS config allows every HTTP method this API actually registers', () => {
  it('allows a PATCH preflight (the officer dashboard save path)', async () => {
    const app = Fastify()
    await app.register(corsPlugin)
    app.patch('/feedback/appeals/:id', async () => ({ ok: true }))
    await app.ready()

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/feedback/appeals/123',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    })

    expect(response.statusCode).toBe(204)
    const allowedMethods = String(response.headers['access-control-allow-methods'] ?? '')
      .split(',')
      .map((m) => m.trim())
    expect(allowedMethods).toContain('PATCH')

    await app.close()
  })
})
