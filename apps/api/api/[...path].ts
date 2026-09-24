import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

// Vercel serverless entrypoint. This is additive, not a replacement for
// src/index.ts — local `npm run dev`/`npm start` (fastify.listen()) are
// untouched. buildApp() already cleanly separates "construct the app" from
// "bind a port" for exactly this reason.
//
// Module-level singleton so a warm container (Vercel reuses them across
// consecutive invocations) doesn't rebuild the app — and doesn't reopen a
// fresh Postgres pool / re-run route registration — on every request.
let appPromise: Promise<FastifyInstance> | undefined

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    const app = buildApp()
    // .ready() wires up every plugin/route without binding a port — Fastify
    // always constructs an internal http.Server at Fastify(), so emitting a
    // synthetic 'request' event on it below is enough to dispatch a real
    // request through the exact same routing/hooks/handlers as the
    // .listen()-based local server.
    appPromise = Promise.resolve(app.ready()).then(() => app)
  }
  return appPromise
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  app.server.emit('request', req, res)
}
