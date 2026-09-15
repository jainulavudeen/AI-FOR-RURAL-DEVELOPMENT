# CDN edge-caching config

Written for the 2G-handset performance pass (see the root `CLAUDE.md` target-user
constraint). **Not yet wired to a live CDN account in this repo or environment** — this
documents the header rules and an example provider config for whoever deploys this, so
static assets and the genuinely cacheable API responses get served from an edge PoP near
the user (Mumbai/Chennai for the Indian user base) instead of round-tripping to origin on
every request. Header correctness was verified locally with `curl -I`; edge latency itself
was not measured here, since there's no live CDN in front of this deployment yet.

## What's cacheable, and why

| Resource | Where it lives | Cache-Control | Why this window |
|---|---|---|---|
| `apps/web/dist/assets/*` (content-hashed JS/CSS/images) | Static host / CDN origin | `public, max-age=31536000, immutable` | Vite hashes the filename on every content change — a given URL's bytes never change, so it's safe to cache "forever." |
| `apps/web/dist/index.html` | Static host / CDN origin | `no-cache` | Must always be revalidated — it's the pointer to the current hashed asset filenames and the PWA update-check entry point. |
| `apps/web/dist/sw.js`, `workbox-*.js` | Static host / CDN origin | `no-cache` | The service worker itself must never be served stale, or clients never pick up a new app version. |
| `GET /feasibility/district-id` | `apps/api` (live, unauthenticated) | `public, max-age=86400` (24h) | District/block names are static reference data — see `districtBlockCache.ts`'s matching 24h Redis TTL. |
| `GET /feasibility/local-demand` | `apps/api` (live, unauthenticated) | `public, max-age=21600` (6h) | Matches `agmarknetCache.ts`'s own `FRESH_SECONDS` freshness window — an edge cache shouldn't outlive the origin's own idea of "fresh." |
| `GET /feasibility/informal-lending-rate` | `apps/api` (live, unauthenticated) | `public, max-age=86400` (24h) | A seeded regional-estimate row that changes rarely; same conservative window as district-id. |

Deliberately **not** made edge-cacheable:

- `POST /feasibility/score` — a POST with a body isn't a cache-key-safe GET; see
  `apps/web/src/lib/marketData.js`'s `localStorage` fallback instead, which handles this
  resource's "available after first load" need at the client rather than the edge.
- Any `apps/api/src/modules/accountAggregator` or `auth`/`feedback` route — all
  authenticated, per-user, or a "saving" action (CLAUDE.md's auth boundary) — never a CDN
  candidate.
- `packages/core/src/schemes.ts` / `socialSchemes.ts` — not served over HTTP at all; they
  compile straight into the JS bundle, so they're already covered by the static-asset rule
  above. `schemeRouter`'s own HTTP routes remain a 501 stub (CLAUDE.md Known Gaps) — out of
  scope for this pass.

## Example provider config (Cloudflare)

Cloudflare is the reference example below — it has real PoPs in both Mumbai and Chennai, a
generous free tier, and Cache Rules that don't require a full reverse-proxy config file (no
static-asset server exists in this repo today to attach one to). Any CDN with Indian edge
coverage (e.g. AWS CloudFront, which also has Mumbai/Chennai/Delhi/Kolkata/Hyderabad edge
locations) works the same way — the header rules above are what actually matter, not the
specific vendor.

Cloudflare Cache Rules (Dashboard → Caching → Cache Rules, or via Terraform/API):

```
Rule 1 — static hashed assets
  When: URI Path matches "/assets/*"
  Then: Cache eligibility = Eligible for cache
        Edge TTL = Respect origin (honors the immutable max-age=31536000 header above)

Rule 2 — index.html / service worker (never cache at the edge)
  When: URI Path in {"/", "/index.html", "/sw.js", "/registerSW.js"} or matches "/workbox-*.js"
  Then: Cache eligibility = Bypass cache

Rule 3 — the 3 cacheable feasibility GETs
  When: URI Path in {"/feasibility/district-id", "/feasibility/local-demand", "/feasibility/informal-lending-rate"}
        and Request Method = "GET"
  Then: Cache eligibility = Eligible for cache
        Edge TTL = Respect origin (honors the per-route max-age set in apps/api/src/modules/feasibility/routes.ts)
```

Everything else (`POST /feasibility/score`, all `auth`/`feedback`/`accountAggregator`
routes) falls through to Cloudflare's default of not caching dynamic responses without an
explicit rule — no action needed.

## Verification done this session

`curl -I` against each of the 3 GET routes (with `apps/api` running locally) confirmed the
new `Cache-Control` header is present and matches the table above — see the before/after
report for the exact command output. No live CDN account exists in this environment, so the
edge-PoP latency improvement itself is not a measured number here — only header
correctness is.
