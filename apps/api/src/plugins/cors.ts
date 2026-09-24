import cors from '@fastify/cors'
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { env } from '../config/env.js'

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    // @fastify/cors defaults `methods` to 'GET,HEAD,POST' — unlike the
    // plain `cors` npm package, it does NOT include PUT/PATCH/DELETE.
    // Left at that default, every browser client's cross-origin PATCH
    // (e.g. the officer dashboard's appeal-status update) fails its CORS
    // preflight silently: the browser blocks the request before it's
    // ever sent, fetch() throws, and it looks exactly like a save
    // failure with no server-side trace at all. Found live: curl bypasses
    // CORS entirely, so this only reproduces from an actual browser.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
}

export default fp(corsPlugin, { name: 'cors' })
