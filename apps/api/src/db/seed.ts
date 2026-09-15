import '../config/loadEnv'
import { isNull } from 'drizzle-orm'
import { MARGIN_PERCENT, SCHEMES } from '@setu/core'
import { db } from './client'
import { applicants, blocks, districts, informalLendingRates, schemeRules } from './schema'

// Fixed demo phone number — sign in via the normal OTP flow (console
// adapter logs the code) to see the Partner Dashboard's officer queue.
const DEMO_OFFICER_PHONE = '+919999900001'

// One pilot district end to end: Madurai, Tamil Nadu (same id used by the
// web app's mock src/data/locations.js, for continuity), with its 3 generic
// blocks. Geometry is left null — real polygons are Prompt 2A's job
// (DIGIPIN + PostGIS ingestion). scheme_rules v1 is copied verbatim from
// packages/core so the DB's "current" version starts in agreement with the
// static client default.
async function main() {
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
  await db.insert(schemeRules).values(
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

  await db
    .insert(applicants)
    .values({ phone: DEMO_OFFICER_PHONE, role: 'officer', phoneVerifiedAt: now })
    .onConflictDoNothing({ target: applicants.phone })

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
    `Seeded Madurai pilot district (3 blocks) + scheme_rules v1 (micro_finance, term_loan) + demo officer (${DEMO_OFFICER_PHONE}) + informal-lending-rate regional fallback`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => process.exit())
