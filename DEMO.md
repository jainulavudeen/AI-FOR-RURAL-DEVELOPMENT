# Setu — Demo Script

Written for a judging round on venue wifi — assume it drops mid-demo, because it might.

## Before judges arrive

```bash
docker compose up -d          # Postgres + Redis
npm run db:migrate -w apps/api
npm run db:reset -w apps/api  # truncates + reseeds the demo dataset — ~0.1s, verified live
npm run dev -w apps/api       # keep this terminal visible — OTP codes print here (SMS_PROVIDER=console)
npm run dev -w apps/web       # separate terminal
```

Open the web app, confirm the officer queue and a couple of demo reports load. Keep the `apps/api` terminal
on screen or at least reachable — every OTP code during the demo prints there as
`[SMS:console] OTP for <phone>: <code>`.

### Demo identities (seeded by `db:reset` — see `apps/api/src/db/seed.ts`)

| Phone | Business | Score band | Scheme | Appeal state |
|---|---|---|---|---|
| `+919876543001` | Dairy | High (85) | Micro Finance | — |
| `+919876543002` | Retail | Marginal (55) | Micro Finance | pending |
| `+919876543003` | Textiles | Moderate (72) | Term Loan | — |
| `+919876543004` | Poultry | Low (38) | Micro Finance | **escalated to CPGRAMS** |
| `+919876543005` | Manufacturing | Moderate (64) | Term Loan | in_review |
| `+919999900001` | — (officer account) | — | — | assigned queue has #2, #4, #5 |

Location for every profile: Tamil Nadu → Madurai → Block A (the seeded pilot district). Six additional
synthetic "dairy / Madurai / moderate" applicants are seeded purely to back the peer-benchmark card — don't
log in as those, they're statistics filler, not demo characters.

## The click path

**1. Landing → Wizard.** Start the eligibility flow. On the business-type step, check "Compare 2–3
businesses instead," pick two or three types, and land on `/compare` — same feasibility factors, same
scheme routing, same EMI math as a single report, side by side. This is the answer to "the tool validates
one already-chosen business, but the real problem is choosing between ideas."

**2. Voice input.** On the location step, tap the mic and say a district name ("Madurai") — it fills
state + district. On the business-type step, say a business type ("Poultry") — same mechanism. If the
browser doesn't support Web Speech API (or a demo machine has no mic), the mic button simply doesn't
render — the dropdowns/grid are the only path either way, nothing looks broken.

**3. Sign in as `+919876543004` (poultry, low score).** OTP prints in the `apps/api` terminal. Land on
`/results`:
   - Score is low → the margin and EMI **MicroLesson** cards are auto-expanded (60-second lessons,
     "Listen" button reads them aloud via Web Speech API — try it in Hindi or Tamil by switching the
     language selector first).
   - **Peer Benchmark card** — "Entrepreneurs Like You" — shows nothing meaningful for poultry (real
     k=5 anonymity gate, no fabricated data); switch to a dairy/Madurai/moderate combination (or just
     note that this card *will* show data once ≥5 similar anonymised applicants exist — the six seeded
     dairy rows are there specifically to prove this, mention it rather than needing to log in as one).
   - **Site Capture card** — check the consent box, tap "Capture Site Photo." On a phone this opens the
     camera; on a laptop with no camera it falls back to a file picker (that's the browser's own
     `<input capture>` behavior, not a bug). Whatever photo is picked gets compressed client-side before
     upload.
   - Because this profile is low-scoring, an **AppealPanel** is visible. It's already escalated in the
     seed data — refresh to show the "Escalated to CPGRAMS — reference MOCK-CPGRAMS-DEMO0001" state
     directly, or explain live: Request Human Review → (after some time, or on request) → Escalate to
     CPGRAMS → a real state machine, mock CPGRAMS adapter (see "What's mocked" below).
   - Tap **"Listen to Full Report"** at the top — reads the whole report aloud in-language, not just the
     numbers.

**4. Sign in as `+919876543003` (textiles, moderate, term loan, no appeal).** Score isn't marginal, so
instead of the appeal panel you'll see the **Marketplace Nudge** — ONDC / e-NAM / GeM links, real official
URLs, shown because the business already looks viable.

**5. Sign in as `+919999900001` (officer).** Open `/partners` — the queue shows applicants #2 (pending),
#4 (escalated), #5 (in_review). Open one, change its status, save. Mention the SLA-sweep button exists
server-side (`POST /feedback/appeals/sweep-sla`) but isn't wired to a UI button or a scheduler this pass —
say so plainly if asked, don't demo a button that doesn't exist.

**6. `/schemes`, `/architecture`.** Static, always-fast, no login needed — good pages to linger on while
narrating if something else is loading.

**7. If you want to show USSD/notifications** (no UI exists for either — they're API-only this pass):
```bash
curl -X POST localhost:4000/ussd/session -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo1","input":""}'          # entry menu
curl -X POST localhost:4000/ussd/session -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo1","input":"1"}'         # picks Dairy
curl -X POST localhost:4000/ussd/session -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo1","input":"20000"}'     # margin -> real calculator output, USSD-screen-sized
```
Narrate it as "this is the exact same `structureFinance()` call the web app makes — same numbers, a
182-character screen instead of a browser." SMS/WhatsApp notifications print to the `apps/api` console
the same way OTP does (`[SMS:console] ...` / `[WhatsApp:console] ...`) — there's no UI trigger for these in
this pass either; if asked to show one live, the scheme-change endpoint is
`POST /notification/scheme-change` (officer-only, needs two real `scheme_rules` row ids).

## If wifi dies mid-demo

Nothing to do — that's the point. Every screen already renders from the client-side calculator and cached
templates with the backend fully unreachable (verified this session — see `HANDOVER.md`'s kill-switch audit).
Concretely:
- The Wizard and Results pages keep computing real margin/loan/EMI numbers — `structureFinance` and
  `buildEmiSchedule` are pure, synchronous, client-side, no network involved, ever.
- The feasibility score falls back to its seeded-baseline value instantly; the real Agmarknet/Census/NRLM
  overlay just never arrives (no visible error, the baseline factor stays as the shown number).
- Compare mode, MicroLesson, and ReportNarration have **zero** network dependency — they work identically
  online or offline.
- Peer Benchmark shows "not enough anonymised data" (its honest empty state, not an error).
- Site Capture, Request Human Review, and Flag This Data show "queued — will send once you're back online"
  (a real Workbox background-sync queue, not a lie) instead of erroring.
- The Partner Dashboard (needs live data) and OTP login (needs a live SMS send) are the two things that
  **do** require connectivity — say so directly if a judge asks to see them and wifi is down, rather than
  pretending otherwise.

The one thing to say out loud if this happens: **"the calculator never needed the network in the first
place — that's the whole architecture, not a fallback we bolted on."**

## What's real vs. what's mocked — be accurate about this

**Real, live, working:**
- The financial calculator (margin/loan/EMI/tenure) — `packages/core`, one implementation, imported by
  both apps, never forked.
- Feasibility scoring's real overlay: Agmarknet mandi-price demand signal (live, Redis-cached), for the
  seeded Madurai district. Census/NRLM infra factors resolve `neutral` today (see Known Gaps in
  `CLAUDE.md`) — say "neutral" if asked, not "not working."
- LLM narration + its numeric validator (reject-and-fallback-to-template on any number not traceable to
  the calculator) — real two-tier pipeline, `LLM_PROVIDER=mock` by default (no Anthropic key needed to
  demo it end to end; the validator logic runs identically either way).
- OTP auth, real JWT sessions, real rate limiting.
- Business comparison, financial-literacy lessons (genuine Hindi/Tamil + TTS), peer benchmark
  (k=5 anonymity, real Postgres aggregate query) — all real, this session's work.
- Geotagged site capture — real DIGIPIN encoding (India Post's actual algorithm, verified against their
  worked example), real client-side compression, real consent-gated Postgres storage, real offline queue.
- CPGRAMS escalation — the state machine, the SLA-breach logic, the 403/409 authorization rules: all real
  and tested. The actual CPGRAMS *filing* is a mock adapter — no real grievance is ever filed with the
  Government of India's portal.
- USSD — the session state machine, Redis-backed sessions, the 182-char/plain-ASCII screen contract: real
  and tested. There is no real USSD short-code or telecom gateway behind it.
- SMS/WhatsApp notification sending — real provider interface, real scheme-change diff logic. SMS can go
  through real MSG91 if credentials are set; WhatsApp is mock-only (no Meta/BSP partnership exists).

**Explicitly mocked, say so if asked:**
- CPGRAMS filing (`MOCK-CPGRAMS-...` reference ids, never a real government reference number).
- WhatsApp sending (console log only).
- Account Aggregator (deterministic seeded transactions, narrated `MOCK:` so they're never mistaken for
  real bank data).
- USSD/SMS telecom gateway integration (no aggregator account exists — this is a real gap, not a hidden one).
- The base feasibility score is still a seeded-random deterministic mock (see `CLAUDE.md`'s Known Gaps) —
  the *overlay* (Agmarknet demand) is real for Madurai; the baseline underneath it is not.

Claiming any of the mocked list as live is the fastest way to lose credibility with a judging panel — don't.
