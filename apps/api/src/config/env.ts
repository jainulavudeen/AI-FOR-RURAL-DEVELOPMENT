import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // REDIS_URL is required only when REDIS_PROVIDER=ioredis (the default —
  // local dev via docker-compose, or any long-running non-Vercel deploy).
  // UPSTASH_REDIS_REST_URL/TOKEN are required only when REDIS_PROVIDER=upstash
  // (Vercel serverless — a persistent TCP client doesn't behave reliably
  // there; see lib/redis/{ioredisClient,upstashClient}.ts). Enforced below
  // via superRefine rather than each being independently required, so
  // neither deploy target needs to configure the other's credentials.
  REDIS_PROVIDER: z.enum(['ioredis', 'upstash']).default('ioredis'),
  REDIS_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  OTP_HASH_SECRET: z.string().min(1, 'OTP_HASH_SECRET is required'),
  // Signs Bank Dossier "Verified Approval" hashes — deliberately its own
  // secret, not a reuse of JWT_SECRET/OTP_HASH_SECRET: a signature that
  // outlives the dossier it's printed on (banks may hold the paper for
  // years) shouldn't share a rotation lifecycle with session/OTP secrets.
  APPROVAL_SIGNING_SECRET: z.string().min(1, 'APPROVAL_SIGNING_SECRET is required'),
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  MSG91_API_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  // WhatsApp Business API needs a Meta Business/BSP partnership and
  // template pre-approval this environment doesn't have — mock only, same
  // posture as ACCOUNT_AGGREGATOR_PROVIDER/CPGRAMS_PROVIDER (no 'real'
  // option exists to accidentally select). See modules/notification/whatsappAdapter.ts.
  WHATSAPP_PROVIDER: z.enum(['console']).default('console'),
  AGMARKNET_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  AGMARKNET_API_KEY: z.string().optional(),
  // Only a mock exists — no real AA partner is integrated (see CLAUDE.md).
  // Kept as an explicit switch anyway, same shape as the other providers,
  // so a future real integration slots in without touching call sites.
  ACCOUNT_AGGREGATOR_PROVIDER: z.enum(['mock']).default('mock'),
  // Same posture: CPGRAMS (pgportal.gov.in) is real government grievance
  // infrastructure with no credentials/partnership here — mock only. See
  // modules/feedback/cpgramsAdapter.ts.
  CPGRAMS_PROVIDER: z.enum(['mock']).default('mock'),
  // Comma-separated allowed origins, or '*' for any (dev default) — the
  // PWA and the API are separate origins, so without this every browser
  // call is blocked by CORS before it ever reaches a route.
  CORS_ORIGIN: z.string().default('*'),
  // LLM narration (CLAUDE.md non-negotiable boundary rule 2) — mock default,
  // same posture as every other external integration here (SMS/Agmarknet/AA):
  // the team runs the whole grounding pipeline, including the numeric
  // validator, with zero credentials.
  LLM_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_FAST_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  LLM_STRONG_MODEL: z.string().default('claude-sonnet-5'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
  // Embeddings for pgvector retrieval — Voyage AI is Anthropic's recommended
  // embeddings partner. Mock default, same shape as LLM_PROVIDER.
  EMBEDDING_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  VOYAGE_API_KEY: z.string().optional(),
  // Reverse-geocodes the Wizard's "use my current location" GPS point to a
  // state/district name (apps/web then matches that against its mock
  // location catalogue — see data/locations.js's matchLocationByName).
  // Unlike every other provider above, OpenStreetMap Nominatim needs no
  // credential/partnership, so this defaults to 'real' rather than 'mock'
  // — GEOCODING_PROVIDER=mock opts back out for tests/fully-offline dev
  // with zero outbound calls. See modules/feasibility/geocodingProvider.ts.
  GEOCODING_PROVIDER: z.enum(['mock', 'real']).default('real'),
  // Nominatim's usage policy requires an identifying User-Agent (no key)
  // and caps at ~1 req/sec — fine here since this is only ever triggered
  // by one explicit user tap, never bulk/automated.
  GEOCODING_USER_AGENT: z.string().default('Setu-SIH26091/1.0 (Smart India Hackathon submission; no contact configured)'),
}).superRefine((val, ctx) => {
  if (val.REDIS_PROVIDER === 'ioredis' && !val.REDIS_URL) {
    ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'REDIS_URL is required when REDIS_PROVIDER=ioredis' })
  }
  if (val.REDIS_PROVIDER === 'upstash') {
    if (!val.UPSTASH_REDIS_REST_URL) {
      ctx.addIssue({ code: 'custom', path: ['UPSTASH_REDIS_REST_URL'], message: 'UPSTASH_REDIS_REST_URL is required when REDIS_PROVIDER=upstash' })
    }
    if (!val.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({ code: 'custom', path: ['UPSTASH_REDIS_REST_TOKEN'], message: 'UPSTASH_REDIS_REST_TOKEN is required when REDIS_PROVIDER=upstash' })
    }
  }
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
