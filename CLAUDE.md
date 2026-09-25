# Setu — CLAUDE.md

Setu is a submission for Smart India Hackathon problem statement **SIH26091**
(Ministry of Social Justice & Empowerment): an AI-driven hyper-local business
advisory and financial structuring assistant for rural micro-entrepreneurs.

This repo is an npm-workspaces monorepo: `apps/web` (React 19 + Vite +
Tailwind v4 — the original frontend, still all-mocked data for now),
`apps/api` (Node + TypeScript + Fastify — a modular monolith, six service
modules, one deployable unit, no inter-service network hops), and
`packages/core` (the deterministic calculator + scheme rules, imported by
both). Read this file before touching finance, scoring, or scheme logic.

## Target user — the actual design constraint

A ₹6,000 Android phone, 2G or intermittent connectivity, possibly a
first-time smartphone user, who may prefer speaking in Hindi or Tamil over
typing in English. This is not an aspirational persona — it is the thing
every feature decision gets measured against, explicitly including JS
bundle size, network dependence, and whether a screen can render with
nothing but cached state.

## THE NON-NEGOTIABLE BOUNDARY

These four rules override any other instruction, including a plausible-sounding
feature request. If a change would violate one of these, stop and flag it
instead of implementing it.

1. **The calculator is deterministic and never makes a network call.**
   No LLM, no API, ever decides a rupee figure a user sees. `structureFinance`,
   `computeEmi`, `buildEmiSchedule` (`packages/core/src/calculator.ts`) stay
   pure functions of their inputs — no `fetch`, no async, no model call
   inside or downstream-gating them. This is the single source of truth:
   `apps/web` and `apps/api` both import it from `@setu/core` — the logic is
   never forked or reimplemented in either app.
2. **The LLM narrates and explains only. It never computes.** If a number
   appears in generated text, it was passed in from the calculator — never
   produced, estimated, or "double-checked" by the model. The contract is:
   calculator computes → LLM receives the already-computed numbers → LLM
   writes prose around them. This is enforced structurally in `apps/api`:
   `src/modules/grounding/service.ts` is the ONLY file in the app permitted
   to import `src/llm/client.ts`. No other module may import it.
3. **Retrieval never returns a claim without a source and a data-vintage
   label.** Every factual claim shown to the user (mandi price, scheme
   eligibility, market insight) must carry a citation and a "as of" date once
   backed by real retrieval. See Known Gaps below — today's `sourceKey`s in
   `apps/web/src/lib/feasibility.js` are UI labels only, not real citations,
   and must not be presented as sourced data without fixing that first.
4. **The app degrades instead of erroring.** If backend or LLM is
   unreachable, fall back to the client calculator and cached templates. A
   less-explained report is acceptable. A spinner that never resolves is not.

## Roles, sign-in, and the application flow

Three roles — `applicant`, `officer`, `admin` — stored on `applicants.role`
and **re-read from the database on every authenticated request**
(`apps/api/src/plugins/auth.ts`: `authenticate` overwrites the JWT's role
with the row's, and refuses deactivated accounts). Use
`fastify.requireRole(...)` on every role-specific route; services re-check
ownership/assignment on top (hiding a button is never the access control).
Public routes stay public by design: the calculator/feasibility/geography
reference GETs (boundary rule 1/4), `GET /auth/config`, and
`GET /applications/verify/:hash`.

- **Sign-in** (`apps/web/src/pages/SignIn.jsx`, the ONE sign-in page —
  `AuthContext.requestLogin()` navigates there with `?next=`): Google
  (GIS ID token verified server-side, `modules/auth/googleVerifier.ts`) or
  phone OTP. One account can hold both (`applicants.google_sub` + `phone`);
  linking happens only from a signed-in session (`/auth/link/google`,
  `/auth/link/phone`, 409 if it belongs to another account). A Google
  sign-in matches by `google_sub`, then a pending `invited_email`, else
  creates an applicant — never by merging on email.
- **Nobody self-registers as officer/admin.** The first admin comes from
  `ADMIN_BOOTSTRAP_PHONE`/`ADMIN_BOOTSTRAP_EMAIL` (`db/bootstrapAdmin.ts`);
  admins invite officers and set their name, designation and jurisdiction
  (`officer_jurisdictions`) in the Admin Portal (`modules/admin/officers.ts`).
- **Landing by role:** applicant → `/dashboard` (My Dashboard), officer →
  `/review` (Review Queue), admin → `/admin`. `apps/web/src/lib/routeAccess.js`
  is the role→route table the guards (`RequireRole`), nav and sign-in
  redirect share.
- **Application flow** (`modules/applications/`): a saved report becomes a
  `draft` application → `submitted` (dossier frozen, jurisdiction-routed) →
  `under_review` → `approved` / `rejected` / `more_info` (note required),
  resubmittable. `application_events` is the applicant-visible timeline;
  every step also goes to `audit_log`. Decisions are append-only
  (`application_decisions`); revising after approval creates new rows and
  marks the old approval superseded, never overwrites it.
- **Verified Approval, not a digital signature.** The approval hash is
  sha256(application id + officer id + timestamp + `APPROVAL_SIGNING_SECRET`);
  the dossier prints it with a server-rendered QR (`lib/qr.ts`) linking to
  the public `/verify/:hash` page, which reveals only officer, designation,
  time, current/superseded and the doc reference. Never call it "digitally
  signed" anywhere — there is no government DSC. Unapproved dossiers print
  "Pending review". Demo accounts and click path: `DEMO_FLOW.md`.

## Scheme rules are versioned

`packages/core/src/schemes.ts` and `socialSchemes.ts` define the static
default financial terms and eligibility rules — the offline client's source
of truth. `apps/api`'s `scheme_rules` table (Drizzle-managed, see
`apps/api/src/db/schema/schemeRules.ts`) is the versioned, validity-dated
source of truth for server-audited reports: each row is one version of one
scheme's rules (margin %, project-cost band, loan cap, rate, tenure,
moratorium), and `reports.scheme_rules_version` is a hard FK to the exact
row that produced a given report. **A report generated under rule-set vN
must stay reproducible after rule-set vN+1 ships** — a user re-opening an
old report sees the numbers that were true when it was generated, not
silently recomputed under new rules. This is enforced by construction: the
old report row still points at the old `scheme_rules` row.

Practical implication for future changes: don't mutate `scheme_rules` rows
in place — insert a new version with its own `effective_from` and close out
the old one's `effective_to`. Don't mutate `packages/core/src/schemes.ts`
in place either, for the same reason on the offline-client side.

## Stack

`apps/web`: React 19 · Vite · Tailwind v4 · react-router-dom v7 · Recharts ·
Framer Motion · vite-plugin-pwa (offline app-shell caching) · Web Speech API
(browser-native voice input, no server-side STT).
`apps/api`: Node + TypeScript · Fastify · Drizzle ORM/drizzle-kit ·
PostgreSQL (PostGIS + pgvector) · Redis · Docker Compose for local Postgres/Redis.
`packages/core`: TypeScript, no framework — pure deterministic logic only.

## Repo layout and where things live

| Path | Owns |
|---|---|
| `apps/web/src/App.jsx` | Route table, every route wrapped in a role guard except the public ones (`/`, `/signin`, `/verify/:hash`, `/architecture`). Applicant: `/dashboard`, `/eligibility`, `/results`, `/compare`, `/bahi-khata`, `/credit-score`, `/advisor-saathi`, `/schemes`, `/bank-dossier`; officer: `/review` (`/partners` redirects there); admin: `/admin`; any role: `/bank-dossier/:id`, `/account`. See "Roles, sign-in, and the application flow" above. |
| `packages/core/src/calculator.ts` | **The** financial calculator: margin/loan/EMI/tenure math. Pure, synchronous, no I/O. Imported as `@setu/core` by both `apps/web` and `apps/api` — see the non-negotiable boundary above before touching this file. |
| `packages/core/src/schemes.ts` | Loan scheme financial terms (rate, cap, tenure, moratorium) for `micro_finance` / `term_loan`. The static default rule set — what makes the offline client deterministic with no backend. `apps/api`'s `scheme_rules` DB table (versioned, with validity dates) becomes the source of truth for server-audited reports once `schemeRouter` is wired for real. |
| `packages/core/src/socialSchemes.ts` | Category-based credit corporation routing: NSFDC (SC), NSTFDC (ST), NBCFDC (OBC), NSKFDC (safai karamcharis), NHFDC (disability), DWBDNC/SEED (DNT), Stand-Up India (SC/ST or woman-owned). Eligibility-category only today — no financial terms attached yet. |
| `apps/api/src/modules/{calculator,feasibility,schemeRouter,grounding,notification,feedback}/` | The six service modules, one deployable unit (modular monolith — no inter-service network hops). `calculator` thinly re-exports `@setu/core` as the server-side audit mirror. `auth`, `feedback`, `feasibility`, and `grounding` are real and live. `feasibility` has two real, unauthenticated GET routes (`/local-demand`, `/informal-lending-rate` — see Known Gaps) plus a real composite `POST /score` (`assembleFeasibilityScore` in `service.ts`) that assembles baseline + Agmarknet demand + Census `village_amenities` infra + NRLM `shg_registry` market signals into a sourced factor breakdown, narrated via `grounding`. `grounding` has a real pgvector retrieval + two-tier (fast/strong) LLM narration pipeline behind `POST /query` and the internal `narrateReport`/`query` exports — see the boundary section above and Known Gaps for what's mock-by-default vs. real. `schemeRouter`'s routes and `notification` are still 501 stubs — `schemeRouter/service.ts` does have one real export (`getCurrentSchemeRuleVersion`, used by `feedback` when persisting a report). |
| `apps/api/src/modules/accountAggregator/` | A **deliberate 7th module**, not one of the six above — consented external financial-data acquisition (RBI Account Aggregator ecosystem) is a genuinely distinct concern from calculator/feasibility/schemeRouter/grounding/notification/feedback, so it wasn't forced into any of them. Mock provider only (`provider.ts`'s `MockAccountAggregatorProvider`) — the real AA flow (consent handle → out-of-band approval in the user's AA app → encrypted FI data session, ECDH key exchange) is real-money regulated infrastructure, explicitly out of scope to integrate for real. All 3 routes (`POST /consent`, `GET /consent/:id`, `POST /consent/:id/fetch`) are `fastify.authenticate`-gated and ownership-checked — this is squarely a "saving" action per the auth boundary, unlike `feasibility`'s public GETs. Every fetch attempt (success or failure) is logged to `aa_fetch_log` for audit. Self-reported margin capital stays the default everywhere in the client; opting into AA is a choice, never a precondition. |
| `apps/api/src/modules/googleMaps/` | Google Maps Platform as a **live enhancement layer only**: competition density (Places Nearby/Text Search), nearest bank/market/school + road distance (Places + Routes `computeRouteMatrix`), and a reverse-geocode address suggestion for site capture. Mock by default (`GOOGLE_MAPS_PROVIDER`). Licensing is enforced structurally: the module has **no database access** (`boundary.test.ts`), Google data lives only in Redis via `cache.ts`'s typed TTL tiers (place_id no expiry, coords 30 days, everything else ≤6 h). **Free tier only, by user decision:** `budget.ts` stops each SKU at a percentage (≤100) of Google's monthly free allowance, then `fallbackProvider.ts` uses free OpenStreetMap services (Photon/OSRM/Nominatim), then government data only; a single answer is never a mix of Google and OSM. Competition density uses only the unlimited-free Text Search IDs-only SKU. Don't add a code path that can exceed the free allowance. Its only score effect is `@setu/core`'s `liveCompetitionAdjustment` (≤ −2, never changes the verdict, display-only, never saved). See `MOCKS.md` for the full contract and free-tier budget. Don't add a Postgres write of any Google field other than place_id, and don't add bulk/batch queries. |
| `apps/api/src/llm/client.ts` | The LLM seam — see boundary rule 2 above. Only `modules/grounding/service.ts` may import it. Real two-tier provider (`LLM_PROVIDER=mock` default / `real` via `@anthropic-ai/sdk`, fast tier `claude-haiku-4-5-20251001`, strong tier `claude-sonnet-5`, both overridable). `llm/embeddingProvider.ts` is the equivalent seam for retrieval embeddings (`EMBEDDING_PROVIDER=mock` default / `real` via Voyage AI). |
| `apps/api/src/db/schema/` | Drizzle table definitions: `applicants`, `districts`, `blocks`, `scheme_rules`, `reports`, `feedback_flags`, `appeals`, `dataset_versions`, `villages`, `village_amenities`, `gp_infrastructure_indicators`, `shg_registry`, `aa_fetch_log`, `informal_lending_rates`. `reports.scheme_rules_version` is a hard FK to the exact `scheme_rules` row used; the ingestion fact tables' `dataset_version_id` works the same way for citing a source's vintage. `applicants` also carries `aa_consent_status`/`aa_consent_scope`/`aa_consent_at` for Account Aggregator opt-in state. `informal_lending_rates` is a two-tier lookup (`district_id` nullable — null means the regional-fallback row) backing the cost-of-inaction card; Agmarknet itself gets no table — it's a live Redis-cached fetch, not batch-ingested. |
| `apps/api/src/ingestion/` | Batch/CLI pipeline (not one of the six HTTP modules — same category as `db/seed.ts`), run via `npm run ingest:<source> -w apps/api`. `digipin/` is a real, tested algorithm (India Post's open spec) whose backfill now has real coordinates to work with, wired into `census/run.ts`. `census/` and `missionAntyodaya/` each parse→validate→load→`recordDatasetVersion` against real downloaded data (see Known Gaps for exactly what was verified). `nrlmShg/` is still real scaffolding with no data — no source was ever found. |
| `apps/web/src/lib/feasibility.js` | Feasibility score + business insights. `generateFeasibility` is still a seeded-random mock (see Known Gaps) — deterministic per (business, state, district, block), rendered instantly, offline-first. `applyDemandSignal` and the newer `applyRealFactors` are non-blocking second passes: once/if `apps/api`'s real `POST /feasibility/score` resolves (via `lib/marketData.js`'s `getFeasibilityScore`), real Agmarknet demand + Census/NRLM infra/market factors and a grounding narration overlay the seeded baseline — a no-op today for any block whose name doesn't resolve to real ingested data (see Known Gaps). |
| `apps/web/src/data/locations.js`, `apps/web/src/data/businesses.js` | Mock catalogues: 8 states × 5 districts × 3 generic blocks; 5 business types. (`data/mockApplicants.js` is gone — the Partner Dashboard reads real `reports`/`appeals` now.) |
| `apps/web/src/i18n/` | `translations.js` (en/hi/ta, dot-path keys, currently 1121 leaf keys each, fully parallel) + `I18nContext.jsx` (lookup/interpolation/fallback-to-en). Keep all three languages parallel — never add a key to one without the others. |
| `apps/web/src/context/AppDataContext.jsx` | Wizard selection state (state/district/block/business/margin/category/isWomanOwned) shared across routes. |
| `apps/web/src/pages/`, `apps/web/src/components/` | UI. `SwotGrid.jsx` reads static per-business-type SWOT text from `translations.js`, not from `feasibility.js` (see Known Gaps). |

## Known gaps — flagged, not accidental

Do not silently "fix" these as drive-by cleanup; they're known and scoped.
Raise with the user before changing behavior here.

- **`apps/web/src/lib/feasibility.js` is placeholder data.** The score,
  business insights, and financial-inclusion insights are seeded-random, not
  real retrieval, despite carrying citation-style `sourceKey`s. Don't present
  them as sourced/real without addressing rule 3 of the boundary above first.
- **`apps/web/src/components/Icon.jsx` does `import * as icons from 'lucide-react'`**
  and resolves icons by string name at runtime. This defeats tree-shaking —
  the whole icon set ships instead of the ~20 icons actually used, and is a
  meaningful chunk of the current 446 KB gzip / 1.6 MB raw single-bundle JS
  (there is no route-level code-splitting either — all 6 pages ship in one
  chunk). Given the target device, this is worth fixing, but only
  intentionally, not as a side effect of an unrelated change.
- **SWOT content does not vary by location.** Unlike the feasibility score
  (seeded on business + state + district + block), `SwotGrid` pulls static
  text keyed only on `businessId` from `translations.js`. Same business type
  shows identical SWOT everywhere.
- **`notification` and `schemeRouter`'s routes are still 501 stubs.**
  `calculator`, `auth`, `feedback`, `feasibility`, and `grounding` are real.
  `notification`'s `/send` stays gated behind `fastify.authenticate` even
  though it doesn't do anything yet — real wiring is later, separate work.
- **`grounding`'s scheme-eligibility corpus is hand-curated, not bulk
  ingested, and two of its six documents lean on secondary sourcing.**
  `apps/api/src/ingestion/schemeDocuments/corpus/*.json` — NSFDC, NBCFDC,
  and NHFDC (now renamed NDFDC — `ndfdc.nic.in`) were fetched live from
  their own official pages. NSKFDC's own site (`nskfdc.nic.in`) failed
  automated fetch every attempt this session (no successful response, not a
  cert or DNS error like NRLM's) — that document instead transcribes a
  Himachal Pradesh State Channelizing Agency's republication of the same
  national NSKFDC terms. Jan Samarth's own portal is a client-rendered SPA
  that returns no scheme content to automated fetch — that document's PMMY
  loan-tier figures were corroborated across multiple independent public
  summaries rather than one directly-fetched primary page. Each corpus
  file's `sourceDescription` states exactly which of these applies; treat
  NSKFDC's and Jan Samarth's figures as needing re-verification against
  their primary sources before relying on them for anything beyond this
  demo. `EMBEDDING_PROVIDER=mock` (default) makes retrieval itself
  non-semantic — real similarity search needs `EMBEDDING_PROVIDER=real` and
  a Voyage AI key.
- **`assembleFeasibilityScore`'s infra/market factors resolve to `neutral`
  for every block today, honestly.** `getInfraSignal`/`getShgSignal`
  (`apps/api/src/modules/feasibility/{infraSignal,shgSignal}.ts`) are real
  Census `village_amenities` / NRLM `shg_registry` joins, but two gaps mean
  they rarely find data yet: `shg_registry` has zero rows loaded anywhere
  (no working NRLM source was ever found — see below), and the seeded
  placeholder blocks (`block_1`/`block_2`/`block_3`, matching apps/web's
  mock block ids) carry no villages — real Census/Mission Antyodaya
  villages sit under differently-named blocks (`Melur`, `Alanganallur`,
  ...). Only the Agmarknet-backed demand factor is real-and-populated for
  the seeded Madurai pilot district today.
- **Officer assignment is by jurisdiction, then fewest open cases** — for
  both applications and appeals (`apps/api/src/modules/applications/assignment.ts`'s
  `pickOfficerForBlock`, fed by `lib/jurisdiction.ts`). An officer covering
  the exact block beats one covering the whole district; no covering,
  active officer → unassigned, for the admin to route. Changing an
  officer's jurisdiction never moves cases already assigned — the admin
  reassigns explicitly (audited). There is no officer "claim" action.
  Officers created before jurisdictions existed have none, so they receive
  nothing new until an admin assigns them some.
- **Google sign-in needs a real `GOOGLE_OAUTH_CLIENT_ID`** (a Google Cloud
  OAuth web client with the web origin authorised). Without it the Google
  button is hidden and phone OTP is the only method. There is deliberately
  no mock Google mode — it would let a client assert its own identity.
  A brand-new user needs connectivity once to sign in; after that the
  cached session keeps the wizard/calculator working offline (the route
  guard checks the session exists, not that its token is fresh).
- **The offline background-sync queue's guarantee has a real edge case.**
  `apps/web/vite.config.js` registers `POST /feedback/flag` and
  `/feedback/appeal` for Workbox background sync — verified live: a
  request made while offline is genuinely captured in IndexedDB and
  survives a reload, and the UI correctly shows "queued" rather than
  hanging or erroring. But the service worker replays the *original*
  queued request, headers included — it never sees `lib/auth.js`'s
  401-refresh logic. If a phone is offline longer than the access token's
  15-minute life, the eventual replay gets a 401, and Workbox counts any
  completed fetch (even a 401) as delivered — it will not retry again.
  "Queued, will send" is a real guarantee for a short signal drop; it is
  not yet a guarantee across an arbitrarily long offline stretch. Fixing
  that needs a custom service worker that refreshes the token before
  replay (`generateSW` → `injectManifest`) — not done here.
- **Of the four ingestion sources (Prompt 2A), three now load real Madurai data end-to-end; one still has nothing.** Real files live at `apps/api/data/ingestion/` (gitignored — real government/redistributed data doesn't belong in the repo). Re-verify sources stay current before trusting this list, government portals change:
  - **DIGIPIN** — real, working now. Pure algorithm (`apps/api/src/ingestion/digipin/algorithm.ts`, ported from [INDIAPOST-gov/digipin](https://github.com/INDIAPOST-gov/digipin), tested against the repo's own worked example). No download needed, ever.
  - **Census 2011 Village Directory** — real data, real load. `censusindia.gov.in`/`data.gov.in`/AIKosh are still unreachable exactly as found earlier, but [SHRUG](https://www.devdatalab.org/shrug_download/) (an academic redistribution) has the same Census Village Directory data as actual downloadable CSVs, shrid2-keyed. `apps/api/src/ingestion/census/` streams and joins `shrid_loc_names.csv` + `shrid2_spatial_stats.csv` + `pc11_vd_clean_shrid.csv`, filtered to Madurai — verified live: 523 real villages, 0 rejected, all 523 with real coordinates. Field encodings (`"1.0"/"0.0"` presence strings, numeric-or-empty distances) were confirmed against actual Madurai rows before the parser was written, not guessed.
  - **Mission Antyodaya** — real data, real load, scoped. The government portals are still dead/dashboard-only as found earlier, but the Ministry of Rural Development's own 2020 survey CSVs exist as real downloadable files (`village-basic-facilities.csv`, `village-agriculture-report.csv` — village grain, with codebooks). `apps/api/src/ingestion/missionAntyodaya/` loads both, filtered to Madurai — verified live: 1,181 rows (589 + 592), 0 rejected. **Deliberately not loaded**: the panchayat/block/district-level files also present on disk — those are GP-grain *counts across constituent villages* (every field is `INT4`/"Count" per the codebook), not a per-village fact, and don't fit a villageId-keyed row without inventing a synthetic village per GP. Present, documented, un-wired; revisit separately if GP-level aggregates turn out to matter.
  - **NRLM SHG Registry** — still nothing. `nrlm.gov.in` serves an SSL certificate for the wrong hostname — a live government-side infrastructure failure, not a fetch-tool limitation. No working alternative found for Tamil Nadu, and nothing for it was among the data manually downloaded either. `apps/api/src/ingestion/nrlmShg/` is real, tested, scaffolding — running it with no input file fails loudly, not silently.
- **Census (shrid2) and Mission Antyodaya (state `village_code`) use two different, uncrossed government coding schemes.** No crosswalk between them was found or downloaded. Both loaders therefore match `villages` by **name** (block name + village name) — `findOrCreateVillage`/`findOrCreateBlock` in each `load.ts`. Spelling/transliteration differences between the two surveys can produce near-duplicate village rows for what's really the same place. Not solved; flagged.
- **`villages`/`blocks` end up with more than one naming convention for the same pilot district.** The seeded placeholder blocks are named `block_1`/`block_2`/`block_3` (1A); real Census subdistrict names (e.g. "Melur") and Mission Antyodaya block names (e.g. "Alanganallur") both get created as their own `blocks` rows rather than matched to the placeholders. Expect multiple naming schemes to coexist under Madurai's `district_id`.
- **`gp_infrastructure_indicators` treats a Gram Panchayat as equivalent to a `villages` row.** A documented pilot-scope simplification (`apps/api/src/db/schema/gpInfrastructureIndicators.ts`) — in practice, both Mission Antyodaya files actually loaded are genuine village grain, so this simplification isn't yet exercised by real data; it would be if the panchayat-level file above ever gets wired in.
- **A blank presence flag and a confirmed-absent one both load as `availableInVillage: false`.** (`apps/api/src/ingestion/census/validate.ts`.) The Census source doesn't distinguish "recorded as absent" from "not recorded" in the columns this pipeline reads — a known, deliberate imprecision, not a bug.
- **Agmarknet's local-demand signal is a generic market-activity proxy, not a per-business commodity mapping.** Only 2 of 5 business types (dairy, poultry) have a natural commodity link to Agmarknet's mandi-price data; retail/textiles/manufacturing don't. Rather than fabricate a mapping for those three, `getLocalDemandSignal` (`apps/api/src/modules/feasibility/service.ts`) applies the same signal — how many commodities are actively price-reporting near a district, and how volatile their prices are — uniformly to every business type, as a coarse "is there active local market activity" proxy. This is a deliberate scoping choice, confirmed with the user, not an oversight. The real Agmarknet API (`api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070`, verified live) needs a self-registered free key — the old shared public demo key returns "Key not authorised" now — so `AGMARKNET_PROVIDER=mock` is the default, same pattern as `SMS_PROVIDER=console`. The signal is now wired into `apps/web/src/lib/feasibility.js`'s client-side score: `generateFeasibility` still renders instantly from its own seeded baseline (offline-first), and `applyDemandSignal` overlays the real signal (fetched via `lib/marketData.js`'s `getLocalDemandSignal`) once/if it resolves, only overriding when the label isn't `'neutral'` — a genuinely unavailable signal leaves the seeded factor standing rather than zeroing it out.
- **Account Aggregator has no real provider — mock only, by explicit scope, not by omission.** `apps/api/src/modules/accountAggregator/provider.ts`'s `MockAccountAggregatorProvider` fast-forwards consent straight to `active` and returns deterministic seeded transactions narrated `"MOCK: ..."` so they're never mistaken for real data mid-demo. A real AA partner integration means real-money regulated infrastructure (out-of-band mobile-app approval, ECDH-encrypted FI data sessions) genuinely out of scope here. `deriveMarginCapital` (`marginDerivation.ts`) is a pure function over whatever transactions the provider returns — swapping in a real provider later requires no change to it. The frontend opt-in now exists (`apps/web/src/components/AccountAggregatorOptIn.jsx`, surfaced on the Results page next to the margin scenario slider) — gated behind login exactly like `AppealPanel`, and it only ever *replaces* `selection.margin`/`marginSource` on explicit click; the Wizard's manual margin entry stays the default with zero precondition, and moving the margin slider afterward flips `marginSource` back to `'self_reported'`. Which source produced a given report is recorded in that report's `dataVintage.marginCapitalSource` (`apps/api/src/modules/feedback/service.ts`'s `createAppeal`).
- **The cost-of-inaction card's informal-lending rate is one honest regional estimate, not real district data — and "district-level" turns out not to be achievable at all, by anyone.** `informal_lending_rates` (schema above) is a real two-tier lookup mechanism, but the district tier is empty — only the seeded `district_id: null` fallback row exists (`apps/api/src/db/seed.ts`: 36%, labelled `"Illustrative regional estimate"`, citing the commonly-cited RBI/NABARD rural informal-credit range). The client now resolves a real `districtId` when one exists (`GET /feasibility/district-id?name=`, added this session, matches by name against the real `districts` table) instead of never sending one — today that only ever resolves for the seeded Madurai pilot district, so the card still correctly shows the regional estimate everywhere, honestly. A live test this session found: a freely-downloadable Harvard Dataverse AIDIS mirror exists but is the wrong derivative dataset (a wealth-inequality correction with no interest-rate/credit-agency/geography fields); the real MoSPI schedule-18.2 microdata (which has the right fields) needs a manual NADA account registration no available tool can complete; and — the load-bearing finding — even that real microdata's finest published geography is **state/NSS-region, never district**, a survey sample-size design limit, not a portal problem (confirmed against NSS 77th round's own press note, which publishes only rural/urban splits, no state or district breakdown). So a future AIDIS ingestion pipeline, once someone registers and drops the file at `apps/api/data/ingestion/aidis/`, could only ever back a **state**-level tier, not a district-level one — don't re-litigate "just go find district data." Not built this session (same treatment as NRLM: flagged, not built) per user decision. `apps/web/src/lib/marketData.js`'s `getInformalLendingRate()` degrades to a hardcoded client-side copy of the same fallback constant if the API is unreachable; `CostOfInactionCard.jsx` shows a "regional estimate" disclaimer whenever `label === 'regional_estimate'`.
- **Google Maps road distances sit next to Census 2011 figures, never in place of them.** The Census side (`GET /feasibility/census-facilities`, `feasibility/censusFacilities.ts`) matches the pin to the nearest ingested Census village within 5 km, so it resolves only in Madurai today. The loaded Census extract has presence flags but almost no distances (the ATM distance is the only one), so the Census column mostly reads "in village / not in village". Rural Google coverage is patchy: a low competition count is treated as "possibly unmapped" and scores 0, never a positive.
- **`apps/api`'s Redis client has a deliberately tight retry config**
  (`apps/api/src/plugins/redis.ts`: `maxRetriesPerRequest: 3`, a capped
  backoff, `connectTimeout: 3000`) — not the ioredis defaults. Found live:
  with the defaults, a command issued after Redis had been down for a
  while could hang for minutes instead of failing fast, which is exactly
  the "spinner that never resolves" boundary rule 4 forbids. Don't loosen
  this without re-testing the hang scenario (kill Redis mid-session, then
  issue a request a good while later — not just immediately after
  startup, which behaves differently).
