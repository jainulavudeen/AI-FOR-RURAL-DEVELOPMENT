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
  // Google Sign-In (Google Identity Services). The OAuth *web* client id
  // from Google Cloud Console — the ID token's `aud` must equal it, checked
  // server-side in modules/auth/googleVerifier.ts. Unset = Google sign-in
  // is disabled (POST /auth/google returns 503, the web hides the button)
  // and phone OTP keeps working. There is deliberately no mock mode: a
  // "mock" verifier would let a client assert its own identity.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  // The first admin — there is no signup path to admin. Applied
  // idempotently by `npm run db:seed` and `npm run admin:bootstrap`
  // (db/bootstrapAdmin.ts): a phone gets an admin row directly; an email
  // becomes a pending invite claimed on that Gmail's first Google sign-in.
  ADMIN_BOOTSTRAP_PHONE: z.string().regex(/^\+[1-9]\d{7,14}$/, 'ADMIN_BOOTSTRAP_PHONE must be E.164, e.g. +919999900009').optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  // Where the web app is served — the Verified Approval QR code on a
  // printed dossier links to `${PUBLIC_WEB_URL}/verify/<hash>`.
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
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
  // Which paid/keyed backend LLM_PROVIDER=real calls. 'gemini' is the
  // default because Google AI Studio has a genuine free tier (no card
  // required); 'anthropic' is the higher-quality original integration this
  // app shipped with, for anyone who does have Claude API credits. Only
  // ever one primary — never both, to avoid double-billing a single
  // narration. See llm/client.ts's createLlmProvider().
  LLM_REAL_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
  // What to retry with if the primary backend call fails or times out —
  // same "primary, then a free fallback" shape as MAP_FALLBACK_PROVIDER.
  // Groq's free tier is fast, keyed, hosted open-weight models; 'none'
  // disables the retry (a primary failure goes straight to the template).
  // A configured LLM_REAL_PROVIDER without its key is a startup error (an
  // explicit choice must actually work); a configured fallback without its
  // key only logs a warning and runs without one — losing the safety net
  // is fine, refusing to start over an optional extra is not (rule 4).
  LLM_FALLBACK_PROVIDER: z.enum(['groq', 'none']).default('groq'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_FAST_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  LLM_STRONG_MODEL: z.string().default('claude-sonnet-5'),
  // Google AI Studio (aistudio.google.com/apikey) — free, no card. Uses
  // Google's own always-current ALIAS names (-latest), not a pinned dated
  // model: a hardcoded model here (this app originally shipped with
  // gemini-2.5-flash) silently 404s the moment Google retires that
  // specific snapshot, which happens on a timescale of months, not years —
  // verified live: gemini-2.5-flash had already been retired for this key
  // by the time this was tested. "-lite" for both tiers, also verified
  // live: noticeably more available than the full "-latest" alias, which
  // returned transient 503 "high demand" on roughly 2 of 3 live calls in
  // testing — override GEMINI_STRONG_MODEL to gemini-flash-latest or
  // gemini-pro-latest yourself if you want more capability on the rare
  // strong-tier call and can tolerate that.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_FAST_MODEL: z.string().default('gemini-flash-lite-latest'),
  GEMINI_STRONG_MODEL: z.string().default('gemini-flash-lite-latest'),
  // Groq (console.groq.com/keys) — free tier, OpenAI-compatible REST API,
  // fast inference for open-weight models. gpt-oss-20b, verified live
  // against a real key (llama-3.3-70b-versatile, this app's first choice,
  // 404s — Groq's own hosted-model lineup shifts over time same as
  // Gemini's does; GET https://api.groq.com/openai/v1/models lists what's
  // actually available to a given key/account right now). One model for
  // both tiers: this is only ever the fallback path, not worth the extra
  // config surface of a fast/strong split for a rarely-hit retry.
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
  // Was 4000 when there was only ever one real call to make. Real now
  // means up to two sequential free-tier calls (primary, then fallback) —
  // see llm/client.ts's FallbackLlmProvider, which splits this budget
  // between them itself rather than needing a second timeout var.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
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
  // Google Maps Platform — a live ENHANCEMENT layer only (competition
  // density, road distances, site-address suggestion), never a dataset.
  // Mock default, same posture as every other paid integration: the whole
  // app, including the enhancement card, demos with no key. See
  // modules/googleMaps/ for the licensing constraints this is built under.
  GOOGLE_MAPS_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // Per-call bound (rule 4 — never a spinner). Every Google call is
  // non-blocking to the report; this only bounds how long the separate
  // enhancement request waits before degrading to "not available".
  GOOGLE_MAPS_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  // Spend caps. Session cap bounds one user/device; the daily cap is the
  // hard global ceiling on billable calls across the whole deployment.
  GOOGLE_MAPS_SESSION_CALL_CAP: z.coerce.number().int().nonnegative().default(20),
  GOOGLE_MAPS_DAILY_CALL_CAP: z.coerce.number().int().nonnegative().default(2000),
  // Free tier only: calls stop at this percent of each SKU's monthly free
  // allowance (see googleMaps/budget.ts FREE_MONTHLY_UNITS). Capped at 100
  // — there is no setting that lets the app spend money.
  GOOGLE_MAPS_FREE_TIER_SAFETY_PERCENT: z.coerce.number().int().min(1).max(100).default(90),
  // Free, keyless OpenStreetMap fallback once Google's free allowance is
  // spent or Google is unreachable ('none' = government data only).
  // Point the URLs at self-hosted instances for large-scale use.
  MAP_FALLBACK_PROVIDER: z.enum(['osm', 'none']).default('osm'),
  PHOTON_URL: z.string().default('https://photon.komoot.io'),
  OSRM_URL: z.string().default('https://router.project-osrm.org'),
  MAP_FALLBACK_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
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

// dotenv sets an empty-but-present `.env` line (e.g. `GOOGLE_OAUTH_CLIENT_ID=`)
// to `''`, not undefined — but every optional var's own comment above says
// "leave blank to disable/opt out", and a plain `.optional()` only treats a
// truly ABSENT key that way, not an empty string. Blank-string-as-unset
// matters most for the handful of fields with an extra refinement on top of
// `.optional()` (`.min(1)`, `.email()`, `.regex()`), which reject `''`
// outright rather than silently accepting it — so without this, copying
// `.env.example` and leaving an optional field blank, exactly as documented,
// fails startup. Normalizing blank strings to undefined before validating
// makes "blank" actually mean "unset" everywhere, matching every comment.
const rawEnv = Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, value === '' ? undefined : value]))

export const env = envSchema.parse(rawEnv)
export type Env = z.infer<typeof envSchema>
