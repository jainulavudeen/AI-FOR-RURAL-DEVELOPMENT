import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'

// Vercel serverless entrypoint (bundled to api/[...path].js by
// scripts/buildFunction.mjs — see that file for why this can't just be
// consumed as raw TS the way api/[...path].ts originally tried: @setu/core's
// package.json deliberately exports raw ./src/index.ts for zero-build local
// DX, which Node's own runtime can't execute directly at deploy time; esbuild
// inlines that one workspace-local import while every real npm dependency
// stays external, resolved normally from node_modules).
//
// This is additive, not a replacement for src/index.ts — local
// `npm run dev`/`npm start` (fastify.listen()) are untouched. buildApp()
// already cleanly separates "construct the app" from "bind a port" for
// exactly this reason.
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

// Vercel's `api/` folder convention means every request this function
// receives is externally prefixed with /api (e.g. a client calling
// /api/auth/otp/request) — but every module in app.ts registers its routes
// unprefixed (/auth, /geography, ...), matching local dev exactly. Stripped
// here, once, so Fastify's own route table never needs to know about
// deployment-specific URL shape. apps/web's VITE_API_BASE_URL in production
// should point at .../api (including the suffix) so its calls line up with
// this on both ends.
function stripApiPrefix(url: string | undefined): string {
  if (!url) return '/'
  if (url === '/api' || url.startsWith('/api/')) return url.slice(4) || '/'
  return url
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  req.url = stripApiPrefix(req.url)
  app.server.emit('request', req, res)
}
