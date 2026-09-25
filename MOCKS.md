# MOCKS.md: what's live Google, what's government data, what's still mocked

Status as of 2026-09-25. Every external integration switches between mock and real with a
`*_PROVIDER` env var (see `.env.example`), and **every mock default runs with no credentials**.
If a demo shows a figure, this file says which of the three kinds it is.

## 1. Government data: the basis of every score and scheme decision

| What | Source | Where | Status |
|---|---|---|---|
| Loan/margin/EMI math | Scheme rules (static + versioned `scheme_rules`) | `packages/core/src/calculator.ts` | **Real**, deterministic, never networked |
| Scheme eligibility | NSFDC/NSTFDC/NBCFDC/NSKFDC/NDFDC/Stand-Up India rules | `packages/core/src/socialSchemes.ts`, `grounding` corpus | **Real** (NSKFDC and Jan Samarth figures come from secondary sources, see CLAUDE.md) |
| Village amenities (bank/market/school in village) | Census 2011 Village Directory via SHRUG | `village_amenities`, `GET /feasibility/census-facilities` | **Real**, Madurai only (523 villages) |
| Village infra / agriculture | Mission Antyodaya 2020 | `gp_infrastructure_indicators` | **Real**, Madurai only |
| Mandi price activity | Agmarknet (data.gov.in) | `feasibility/agmarknetProvider.ts` | Real API wired, **mock by default** (`AGMARKNET_PROVIDER=mock`, needs a free key) |
| DIGIPIN | India Post open algorithm | `ingestion/digipin/algorithm.ts` | **Real**. This is the permanent machine-readable location on every report and site capture |
| Admin geography (states/districts/blocks) | Census 2011 names | `ingestion/adminHierarchy/` | **Real**, nationwide |
| SHG density | NRLM registry | `shg_registry` | **No data**. The source portal is broken; the factor stays `neutral` |
| Informal lending rate | RBI/NABARD range | `informal_lending_rates` | One **illustrative regional estimate**, labelled as such |

## 2. Live map data: Google free tier first, then free OpenStreetMap, never paid

Module: `apps/api/src/modules/googleMaps/`. Switch: `GOOGLE_MAPS_PROVIDER=mock|real` (default
**mock**) plus `GOOGLE_MAPS_API_KEY`. Enable these three APIs on the key: **Places API (New)**,
**Routes API**, **Geocoding API**.

**Nothing in this layer spends money.** Every lookup follows the same chain:

1. **Google, strictly inside its monthly free allowance.** `budget.ts` counts every real call per
   SKU per billing month, on US Pacific time as Google bills. Calls stop at
   `GOOGLE_MAPS_FREE_TIER_SAFETY_PERCENT` (default 90%, max 100%) of the free allowance. No setting
   raises the limit past free.
2. **OpenStreetMap, which is free and needs no key.** Photon (komoot) finds places, OSRM gives road
   distance and travel time, and Nominatim gives addresses.
3. **Government data only.** The report is already complete without either of the above.

| Feature | Google API / SKU | Free per month (our cap at 90%) | Use per new location | Fallback once the cap is reached |
|---|---|---|---|---|
| Competition density | Places Text Search (New), **Essentials IDs Only** | **Unlimited, always free** | 1–4 searches (one per mapped type) | none needed; hidden if Google is down |
| Nearest bank / market / school | Places Nearby Search (New), Pro | 5,000 (4,500) | 1 combined call | OSM Photon |
| Road distance + time | Routes `computeRouteMatrix`, Essentials | 10,000 elements (9,000) | 3 elements | OSM OSRM. The whole facility lookup goes to OSM, so the two sources are never mixed |
| Coordinates refresh after 30 days | Place Details (New), Essentials | 10,000 (9,000) | 0–3 | OSM path |
| Site address suggestion | Geocoding API, reverse | 10,000 (9,000) | 1, only when the site is captured | OSM Nominatim |

- **Monthly capacity:** Google alone covers about **3,000 new locations/month**, since Routes is
  the tightest allowance. Beyond that, OpenStreetMap covers the rest at no cost.
- **Repeats are free:** a repeat view within 6 hours at the same ~110 m spot uses nothing. Between
  6 hours and 30 days, the cached place_ids skip the Nearby Search.
- **Actual cost per report: $0.**

**Business type → Google mapping** (user-approved; every type string checked against Google's Table A):

| Business | Query (free Text Search IDs-only, 5 km box, strict type filter) |
|---|---|
| dairy | text `"dairy milk"`. No dairy place type exists |
| retail | `grocery_store`, `convenience_store`, `supermarket`, `general_store` (one search each, unique places counted) |
| textiles | `clothing_store`, `tailor` |
| poultry | text `"poultry chicken farm"`. `butcher_shop` is a buyer, not a competitor |
| manufacturing | `manufacturer` |

Each search returns up to 20 results. If any search fills its page, the count shows as **"N or
more"**. Competition has **no OpenStreetMap fallback** on purpose: OSM shop tagging is too sparse
in rural India to count competitors honestly.

### Hard backstop, recommended before using a real key

Our counter only sees calls made by this app. For a real guarantee, also set quotas in
**Google Cloud Console → APIs & Services → each API → Quotas**:
- **Places API (New):** Nearby Search about 150 requests/day. Text Search can stay unlimited
  (IDs-only is free).
- **Routes API:** Compute Route Matrix about 300 elements/day.
- **Geocoding API:** about 300 requests/day.

At these limits Google refuses extra calls instead of billing them, and the app falls back to
OpenStreetMap on its own. Also add a billing **budget alert at $1**. Google requires a billing
account even for free-tier use.

`GET /google-maps/usage` (admin login) shows this month's usage per SKU against its free cap, plus
daily call counts. It also shows the list price the same traffic *would* cost, for projecting a
paid national rollout.

### OpenStreetMap fallback: fair use

The public Photon, OSRM and Nominatim servers are free but fair-use. OSRM's demo server says it is
not for production. Each session's fallback calls share the same per-session cap as Google calls,
and results are cached for 6 hours per ~110 m spot. For a large deployment, self-host these
open-source services and repoint `PHOTON_URL` / `OSRM_URL`.

Overpass was tested live and rejected: public instances took 11–16 s or timed out. OSM data is
credited "© OpenStreetMap contributors" (ODbL) wherever it is shown.

### Licensing guardrails (built in, and tested)

- **Nothing Google-derived reaches Postgres.** The module has no database access, and
  `boundary.test.ts` fails the build if it gains any. It is also the only code that imports the
  Google provider.
- **The Redis TTL tiers are enforced by typed setters** (`cache.ts`):
  - `place_id`: no expiry. Only a bare place_id is accepted.
  - Coordinates: 30 days. Only lat/lon are written.
  - Everything else: capped at 6 hours. Names, addresses, ratings, reviews, photos and phone
    numbers are refused.
- **No bulk querying.** Every call comes from one user viewing one report.
- **No client-side caching.** Responses are `Cache-Control: no-store`, the service worker has a
  `NetworkOnly` rule for `/google-maps/*`, and nothing is written to localStorage.
- **Attribution follows the source actually shown.** Google data shows "Google Maps" (Roboto,
  12px, #5E5E5E, never translated) plus any providers the response names. OSM data shows
  "© OpenStreetMap contributors".
- **Sources are never mixed in one answer.** OSM routing is never run over Google places.
- **The site address is kept only as user-provided data.** `site_captures.confirmed_address` holds
  what the user saved, and `address_source` records `user_confirmed`, `user_corrected` or
  `user_entered`.

### How it affects the score

- Government data stays the basis. Only competition density feeds the score, as a **low-weight,
  display-only** factor (`@setu/core` `liveCompetitionAdjustment`):
  - 0 below 10 results, since a low rural count may mean "unmapped"
  - −1 for 10–19 results
  - −2 for 20 or more
  - never positive
  - clamped so it **can never change the verdict band**
- Saved reports, appeals and scheme matching use the government-only score.
- Road distances are shown **next to** the Census 2011 figure, each with its own date. The Census
  number is never replaced.

### Degradation

- **Timeouts:** 3 s per Google call, 4 s per OSM call, and a 12 s client abort. The report renders
  first; the card fills in later, or never.
- **Caps:** per session (`GOOGLE_MAPS_SESSION_CALL_CAP`, default 20 per 12 h) and per day
  (`GOOGLE_MAPS_DAILY_CALL_CAP`). If Redis is unreachable, no Google call goes out.
- **Offline:** no Google or OSM call is made. The card shows the Census column only (the service
  worker caches it once seen), or nothing. It never shows an empty slot.

### Mock provider

`MockGoogleMapsProvider` returns deterministic seeded data tagged `provider: 'mock'`, and the UI
shows a **"Demo data — no Google Maps API key configured"** badge. In mock mode no network call is
made. The OSM fallback only runs when Google is in real mode and cannot answer for free.

## 3. Still mocked or placeholder: say so if asked

- **Account Aggregator:** mock only (`MOCK:`-narrated seeded transactions). Real AA is regulated
  infrastructure and out of scope.
- **CPGRAMS filing:** mock adapter (`MOCK-CPGRAMS-…` reference ids).
- **WhatsApp:** console only. **SMS:** console by default, and real through MSG91 if credentials
  are set. **USSD:** real state machine with no telecom gateway behind it.
- **LLM narration:** mock by default (`LLM_PROVIDER=mock`). The real Anthropic provider is wired in.
- **Embeddings:** mock by default, which makes retrieval non-semantic. The real Voyage AI provider
  is wired in.
- **Agmarknet:** mock by default (see section 1).
- **Google Maps:** mock by default. In real mode it stays inside the free tier, with the OpenStreetMap fallback (see section 2).
- **`apps/web/src/lib/feasibility.js` insights:** seeded-random placeholder values. Their
  `sourceKey`s are UI labels, not citations.
- **SWOT text:** static per business type, not location-aware.
- **Feasibility factors outside the pilot district:** may be AI-estimated. These are always
  labelled with a sparkle mark and never presented as measured data.
