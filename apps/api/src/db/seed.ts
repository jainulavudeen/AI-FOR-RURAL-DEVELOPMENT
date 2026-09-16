import '../config/loadEnv'
import { isNull } from 'drizzle-orm'
import { buildEmiSchedule, classifyVerdict, MARGIN_PERCENT, SCHEMES, structureFinance } from '@setu/core'
import type { Db } from './client'
import { db } from './client'
import { applicants, appeals, blocks, districts, informalLendingRates, reports, schemeRules } from './schema'
import { K_ANONYMITY_THRESHOLD } from '../modules/feasibility/peerBenchmark'

// Fixed demo phone number — sign in via the normal OTP flow (console
// adapter logs the code) to see the Partner Dashboard's officer queue.
const DEMO_OFFICER_PHONE = '+919999900001'

// Five applicant profiles chosen to exercise both schemes and all four
// score bands in one seed run — real demo material, not filler. Every
// figure (project cost, loan amount, EMI) is computed through the exact
// same @setu/core functions the app itself uses, never hand-typed: seed
// data claiming to be a "report" has to obey CLAUDE.md's boundary same as
// a live one. Only `score`/`verdictKey` are picked directly (feasibility
// scoring is a seeded-random client-side mock — see CLAUDE.md's Known
// Gaps — so there's no equivalent single source of truth to compute
// score from server-side).
// Full 10-digit numbers spelled out directly, not built by string
// concatenation — a first version concatenated a 5-digit prefix with a
// 4-digit suffix (9 digits total, one short of a real Indian mobile
// number's length) and the bug went unnoticed until an actual OTP
// login/GET /reports/:id test against a live DB caught it. Verified live
// this time.
const DEMO_PROFILES = [
  { phone: '+919876543001', businessId: 'dairy', margin: 12000, score: 85, appeal: null },
  { phone: '+919876543002', businessId: 'retail', margin: 10000, score: 55, appeal: 'pending' as const },
  { phone: '+919876543003', businessId: 'textiles', margin: 50000, score: 72, appeal: null },
  { phone: '+919876543004', businessId: 'poultry', margin: 8000, score: 38, appeal: 'escalated' as const },
  { phone: '+919876543005', businessId: 'manufacturing', margin: 60000, score: 64, appeal: 'in_review' as const },
]

// One pilot district end to end: Madurai, Tamil Nadu (same id used by the
// web app's mock src/data/locations.js, for continuity), with its 3 generic
// blocks. Geometry is left null — real polygons are Prompt 2A's job
// (DIGIPIN + PostGIS ingestion). scheme_rules v1 is copied verbatim from
// packages/core so the DB's "current" version starts in agreement with the
// static client default.
export async function seedDemoData(db: Db) {
  const [maduraiDistrict] = await db
    .insert(districts)
    .values({
      stateCode: 'tamil_nadu',
      stateName: 'Tamil Nadu',
      name: 'madurai',
      digipin: null,
      geom: null,
    })
    .returning()

  if (!maduraiDistrict) throw new Error('Failed to insert pilot district')

  await db.insert(blocks).values(
    ['block_1', 'block_2', 'block_3'].map((name) => ({
      districtId: maduraiDistrict.id,
      name,
      digipin: null,
      geom: null,
    }))
  )

  const now = new Date()
  const insertedSchemeRules = await db
    .insert(schemeRules)
    .values(
      Object.values(SCHEMES).map((scheme) => ({
        schemeId: scheme.id,
        version: 1,
        marginPercent: String(MARGIN_PERCENT),
        projectCostMin: String(scheme.projectCostMin),
        projectCostMax: String(scheme.projectCostMax),
        loanCap: String(scheme.loanCap),
        interestRate: String(scheme.interestRate),
        tenureYears: String(scheme.tenureYears),
        moratoriumMonths: scheme.moratoriumMonths,
        effectiveFrom: now,
        effectiveTo: null,
      }))
    )
    .returning()

  const [demoOfficer] = await db
    .insert(applicants)
    .values({ phone: DEMO_OFFICER_PHONE, role: 'officer', phoneVerifiedAt: now })
    .onConflictDoNothing({ target: applicants.phone })
    .returning({ id: applicants.id })

  // Five demo applicant profiles — see DEMO_PROFILES above for why these
  // particular five. Each one's finance figures come straight out of
  // structureFinance/buildEmiSchedule, the exact same functions Results.jsx
  // calls; this data is real calculator output, not typed-in numbers.
  for (const profile of DEMO_PROFILES) {
    const scheme = insertedSchemeRules.find((r) => r.schemeId === structureFinance(profile.margin).scheme.id)
    if (!scheme) continue

    const [applicant] = await db
      .insert(applicants)
      .values({ phone: profile.phone, role: 'applicant', phoneVerifiedAt: now })
      .onConflictDoNothing({ target: applicants.phone })
      .returning({ id: applicants.id })
    if (!applicant) continue

    const finance = structureFinance(profile.margin)
    const schedule = buildEmiSchedule({
      loanAmount: finance.loanAmount,
      interestRate: finance.scheme.interestRate,
      tenureYears: finance.scheme.tenureYears,
      moratoriumMonths: finance.scheme.moratoriumMonths,
    })
    const verdictKey = classifyVerdict(profile.score)

    const [report] = await db
      .insert(reports)
      .values({
        applicantId: applicant.id,
        inputs: {
          stateId: 'tamil_nadu',
          districtId: 'madurai',
          blockId: 'block_1',
          businessId: profile.businessId,
          margin: profile.margin,
          marginSource: 'self_reported',
          categoryId: '',
          isWomanOwned: false,
        },
        score: profile.score,
        verdictKey,
        matchedSchemeId: finance.scheme.id,
        schemeRulesVersion: scheme.id,
        emiSchedule: schedule.rows,
        dataVintage: {
          feasibility: 'mock-seeded-random',
          calculator: '@setu/core',
          schemeRules: `${finance.scheme.id}@v1`,
          marginCapitalSource: 'self_reported',
          generatedAt: now.toISOString(),
          seedNote: `demo profile — ${profile.businessId}, ${verdictKey}`,
        },
      })
      .returning({ id: reports.id })

    if (!profile.appeal || !report) continue

    if (profile.appeal === 'escalated') {
      await db.insert(appeals).values({
        applicantId: applicant.id,
        reportId: report.id,
        status: 'escalated',
        assignedOfficerId: demoOfficer?.id ?? null,
        escalatedAt: now,
        escalationReason: 'applicant_requested',
        cpgramsReferenceId: 'MOCK-CPGRAMS-DEMO0001',
      })
    } else {
      await db.insert(appeals).values({
        applicantId: applicant.id,
        reportId: report.id,
        status: profile.appeal,
        assignedOfficerId: demoOfficer?.id ?? null,
      })
    }
  }

  // Peer-benchmark demo data (see modules/feasibility/peerBenchmark.ts):
  // K_ANONYMITY_THRESHOLD distinct applicants, all "dairy" business in the
  // seeded Madurai pilot district, all landing in the same score band, so
  // the demo has at least one real, non-empty benchmark bucket to show
  // instead of always hitting "not enough data." Every phone number here is
  // an obviously-synthetic demo identity, not a real person.
  const microFinanceRule = insertedSchemeRules.find((r) => r.schemeId === 'micro_finance')
  if (microFinanceRule) {
    const demoScore = 70
    const demoVerdictKey = classifyVerdict(demoScore)
    const demoApplicants = await db
      .insert(applicants)
      .values(
        Array.from({ length: K_ANONYMITY_THRESHOLD + 1 }, (_, i) => ({
          phone: `+91900000${String(i + 1).padStart(4, '0')}`,
          role: 'applicant' as const,
          phoneVerifiedAt: now,
        }))
      )
      .onConflictDoNothing({ target: applicants.phone })
      .returning({ id: applicants.id })

    if (demoApplicants.length > 0) {
      await db.insert(reports).values(
        demoApplicants.map((a) => ({
          applicantId: a.id,
          inputs: {
            stateId: 'tamil_nadu',
            districtId: 'madurai',
            blockId: 'block_1',
            businessId: 'dairy',
            margin: 20000,
            marginSource: 'self_reported',
            categoryId: '',
            isWomanOwned: false,
          },
          score: demoScore,
          verdictKey: demoVerdictKey,
          matchedSchemeId: 'micro_finance',
          schemeRulesVersion: microFinanceRule.id,
          emiSchedule: [],
          dataVintage: {
            feasibility: 'mock-seeded-random',
            calculator: '@setu/core',
            schemeRules: `micro_finance@v1`,
            marginCapitalSource: 'self_reported',
            generatedAt: now.toISOString(),
            seedNote: 'synthetic peer-benchmark demo data, not a real applicant',
          },
        }))
      )
    }
  }

  // No unique constraint on the district_id-null fallback row (NULL !=
  // NULL under a unique index, so onConflictDoNothing can't dedupe it) —
  // check-then-insert instead, so re-running seed.ts doesn't pile up
  // duplicate fallback rows.
  const [existingFallback] = await db.select().from(informalLendingRates).where(isNull(informalLendingRates.districtId)).limit(1)
  if (!existingFallback) {
    await db.insert(informalLendingRates).values({
      districtId: null,
      ratePercent: '36',
      isEstimate: true,
      vintageLabel: 'Illustrative regional estimate',
      sourceDescription:
        'Not measured — commonly cited range for rural informal-credit interest rates in RBI/NABARD literature (roughly 24-60% p.a.). ' +
        'District-level data has not been ingested (NABARD/NSSO AIDIS is the real source; its download mechanics were not verified this session). ' +
        'This single regional figure is a placeholder until real district data lands.',
    })
  }

  console.log(
    `Seeded Madurai pilot district (3 blocks) + scheme_rules v1 (micro_finance, term_loan) + demo officer (${DEMO_OFFICER_PHONE}) + informal-lending-rate regional fallback + ${K_ANONYMITY_THRESHOLD + 1} synthetic peer-benchmark reports + ${DEMO_PROFILES.length} demo applicant profiles (dairy/retail/textiles/poultry/manufacturing, both schemes, all four score bands)`
  )
}

// CLI entry point — `npm run db:seed -w apps/api`. db/reset.ts imports
// seedDemoData directly instead of shelling out to this file, so the two
// scripts share one seeding implementation rather than forking it.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoData(db)
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => process.exit())
}
