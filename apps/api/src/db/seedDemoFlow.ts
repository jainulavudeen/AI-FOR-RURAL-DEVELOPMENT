import '../config/loadEnv.js'
import { and, eq, isNotNull } from 'drizzle-orm'
import { buildEmiSchedule, classifyVerdict, structureFinance } from '@setu/core'
import { env } from '../config/env.js'
import { computeApprovalSignatureHash } from '../lib/approvalSignature.js'
import { getCurrentSchemeRuleVersion } from '../modules/schemeRouter/service.js'
import { generateDossier, type BankDossierDeps } from '../modules/bankDossier/service.js'
import { bootstrapAdmin } from './bootstrapAdmin.js'
import type { Db } from './client.js'
import { db } from './client.js'
import {
  applicants,
  applicationDecisions,
  applicationEvents,
  applications,
  auditLog,
  bankDossiers,
  blocks,
  districts,
  officerJurisdictions,
  reports,
} from './schema/index.js'

// The role-flow demo (see DEMO_FLOW.md at the repo root): 1 admin, 3
// officers covering different Tamil Nadu districts, 4 applicants in
// different blocks — one of them in a block no officer covers. Idempotent:
// accounts are upserted by phone, jurisdictions replaced, and an
// applicant's demo application is only created if they have none yet, so
// re-running never duplicates anything and never touches accounts it
// didn't create.
//
// Needs the real nationwide geography (`npm run ingest:admin-hierarchy`)
// for the Tamil Nadu districts/blocks below; skips with a message if absent.
// Every rupee figure in a seeded report comes from @setu/core, same as a
// live one (CLAUDE.md boundary rule 1).

export const DEMO_FLOW = {
  officers: [
    {
      phone: '+919999900001',
      displayName: 'K. Meena',
      designation: 'District Industries Centre Officer, Madurai',
      district: 'madurai',
      blocks: null, // whole district
    },
    {
      phone: '+919999900002',
      displayName: 'R. Suresh',
      designation: 'Block Development Officer, Pollachi',
      district: 'coimbatore',
      blocks: ['pollachi', 'sulur'],
    },
    {
      phone: '+919999900003',
      displayName: 'A. Fathima',
      designation: 'Lead District Manager, Tiruchirappalli',
      district: 'tiruchirappalli',
      blocks: null,
    },
  ],
  // `state` = what the seeded application is left in, so each dashboard
  // has something to show before the live walkthrough starts.
  applicants: [
    { phone: '+919876500001', name: 'Lakshmi S.', district: 'madurai', block: 'melur', businessId: 'dairy', margin: 15000, score: 78, state: 'none' },
    { phone: '+919876500002', name: 'Murugan P.', district: 'coimbatore', block: 'pollachi', businessId: 'poultry', margin: 12000, score: 66, state: 'submitted' },
    { phone: '+919876500003', name: 'Selvi R.', district: 'tiruchirappalli', block: 'srirangam', businessId: 'textiles', margin: 40000, score: 81, state: 'approved' },
    { phone: '+919876500004', name: 'Arjun K.', district: 'dindigul', block: 'palani', businessId: 'retail', margin: 9000, score: 58, state: 'submitted' }, // no officer covers Dindigul
  ],
} as const

const FALLBACK_ADMIN_PHONE = '+919999900009'

async function findDistrict(database: Db, name: string) {
  const [row] = await database
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.stateCode, 'tamil_nadu'), eq(districts.name, name), isNotNull(districts.code)))
    .limit(1)
  return row?.id ?? null
}

async function findBlock(database: Db, districtId: string, name: string) {
  const [row] = await database
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.districtId, districtId), eq(blocks.name, name), isNotNull(blocks.code)))
    .limit(1)
  return row?.id ?? null
}

async function upsertByPhone(database: Db, phone: string, values: Partial<typeof applicants.$inferInsert>) {
  const now = new Date()
  const [row] = await database
    .insert(applicants)
    .values({ phone, phoneVerifiedAt: now, ...values })
    .onConflictDoUpdate({ target: applicants.phone, set: { ...values, updatedAt: now } })
    .returning({ id: applicants.id })
  if (!row) throw new Error(`Failed to upsert ${phone}`)
  return row.id
}

export async function seedDemoFlow(database: Db): Promise<string> {
  const tn = await findDistrict(database, 'madurai')
  if (!tn) return 'Skipped role-flow demo: Tamil Nadu geography not loaded (run `npm run ingest:admin-hierarchy -w apps/api` first)'

  // 1 admin — from ADMIN_BOOTSTRAP_* if set, else the fixed demo phone.
  const bootstrapped = await bootstrapAdmin(database)
  const adminId = env.ADMIN_BOOTSTRAP_PHONE
    ? (await database.select({ id: applicants.id }).from(applicants).where(eq(applicants.phone, env.ADMIN_BOOTSTRAP_PHONE)).limit(1))[0]?.id
    : await upsertByPhone(database, FALLBACK_ADMIN_PHONE, { role: 'admin', active: true, displayName: 'Setu Administrator', designation: 'Programme Administrator' })
  if (!adminId) throw new Error('No admin account after bootstrap')

  // 3 officers + their jurisdictions.
  const officerIdByDistrict = new Map<string, string>()
  for (const o of DEMO_FLOW.officers) {
    const officerId = await upsertByPhone(database, o.phone, { role: 'officer', active: true, displayName: o.displayName, designation: o.designation })
    const districtId = await findDistrict(database, o.district)
    if (!districtId) throw new Error(`District ${o.district} missing`)
    const entries: Array<{ districtId: string; blockId: string | null }> = []
    if (o.blocks) {
      for (const b of o.blocks) {
        const blockId = await findBlock(database, districtId, b)
        if (!blockId) throw new Error(`Block ${o.district}/${b} missing`)
        entries.push({ districtId, blockId })
      }
    } else {
      entries.push({ districtId, blockId: null })
    }
    await database.delete(officerJurisdictions).where(eq(officerJurisdictions.officerId, officerId))
    await database.insert(officerJurisdictions).values(entries.map((e) => ({ ...e, officerId, createdBy: adminId })))
    officerIdByDistrict.set(o.district, officerId)
  }

  // 4 applicants, each with one real saved report and (except the first,
  // who does the live walkthrough) an application in a meaningful state.
  const created: string[] = []
  for (const a of DEMO_FLOW.applicants) {
    const applicantId = await upsertByPhone(database, a.phone, { role: 'applicant', displayName: a.name })
    const [existing] = await database.select({ id: applications.id }).from(applications).where(eq(applications.applicantId, applicantId)).limit(1)
    if (existing || a.state === 'none') continue

    const districtId = await findDistrict(database, a.district)
    const blockId = districtId ? await findBlock(database, districtId, a.block) : null
    if (!districtId || !blockId) throw new Error(`Location ${a.district}/${a.block} missing`)

    const finance = structureFinance(a.margin)
    const rule = await getCurrentSchemeRuleVersion(database, finance.scheme.id)
    if (!rule) throw new Error(`No scheme_rules row for ${finance.scheme.id} — run the base seed first`)
    const schedule = buildEmiSchedule({
      loanAmount: finance.loanAmount,
      interestRate: finance.scheme.interestRate,
      tenureYears: finance.scheme.tenureYears,
      moratoriumMonths: finance.scheme.moratoriumMonths,
    })
    const inputs = {
      stateId: 'tamil_nadu',
      stateName: 'Tamil Nadu',
      districtId: a.district,
      blockId: a.block,
      businessId: a.businessId,
      margin: a.margin,
      marginSource: 'self_reported',
      categoryId: '',
      isWomanOwned: false,
    }
    const verdictKey = classifyVerdict(a.score)
    const now = new Date()
    const [report] = await database
      .insert(reports)
      .values({
        applicantId,
        inputs,
        score: a.score,
        verdictKey,
        matchedSchemeId: finance.scheme.id,
        schemeRulesVersion: rule.id,
        emiSchedule: schedule.rows,
        dataVintage: {
          feasibility: 'mock-seeded-random',
          calculator: '@setu/core',
          schemeRules: `${finance.scheme.id}@v${rule.version}`,
          marginCapitalSource: 'self_reported',
          generatedAt: now.toISOString(),
          seedNote: 'role-flow demo applicant (DEMO_FLOW.md)',
        },
      })
      .returning({ id: reports.id, createdAt: reports.createdAt })
    if (!report) throw new Error('Failed to insert report')

    const [app] = await database.insert(applications).values({ applicantId, reportId: report.id }).returning({ id: applications.id })
    if (!app) throw new Error('Failed to insert application')

    // Freeze the dossier through the real generateDossier path.
    const dossierDeps: BankDossierDeps = {
      getTransactionsByApplicantId: async () => [],
      getApplicantPhone: async () => a.phone,
      insertDossier: async (input) => {
        const [row] = await database.insert(bankDossiers).values(input).returning()
        if (!row) throw new Error('Failed to insert dossier')
        return { id: row.id, applicantId: row.applicantId, schemeId: row.schemeId, snapshot: input.snapshot, createdAt: row.createdAt.toISOString() }
      },
      getDossierById: async () => null,
      officerCanSeeDossier: async () => false,
      getApplicationApproval: async () => null,
      getApprovalsByDossierId: async () => [],
      getApprovalByHash: async () => null,
      insertAuditLogEntry: async () => {},
    }
    const dossier = await generateDossier(
      dossierDeps,
      applicantId,
      { selection: inputs, schemeId: finance.scheme.id, proprietorName: a.name, bankName: null },
      {
        report: {
          reportId: report.id,
          applicationId: app.id,
          score: a.score,
          verdictKey,
          matchedSchemeId: finance.scheme.id,
          blockId: a.block,
          businessId: a.businessId,
          margin: a.margin,
          reportCreatedAt: report.createdAt.toISOString(),
        },
      }
    )

    const officerId = officerIdByDistrict.get(a.district) ?? null
    const log = async (actorId: string, actorRole: string, action: string, metadata: Record<string, unknown>) =>
      database.insert(auditLog).values({ actorId, actorRole, action, targetType: 'application', targetId: app.id, metadata: { ...metadata, seeded: true } })
    const event = async (actorId: string, actorRole: string, fromStatus: string | null, toStatus: string, note: string | null = null) =>
      database.insert(applicationEvents).values({ applicationId: app.id, actorId, actorRole, fromStatus, toStatus, note })

    await event(applicantId, 'applicant', null, 'draft')
    await log(applicantId, 'applicant', 'application_created', { reportId: report.id })
    await event(applicantId, 'applicant', 'draft', 'submitted')
    await log(applicantId, 'applicant', 'application_submitted', { fromStatus: 'draft', toStatus: 'submitted', reportId: report.id, dossierId: dossier.id })
    await log(applicantId, 'system', officerId ? 'application_assigned' : 'application_unassigned', { toOfficerId: officerId, routing: officerId ? 'jurisdiction' : 'unassigned', districtId, blockId })

    let status = 'submitted'
    if (a.state === 'approved' && officerId) {
      const officer = DEMO_FLOW.officers.find((o) => o.district === a.district)!
      await event(officerId, 'officer', 'submitted', 'under_review')
      await log(officerId, 'officer', 'application_review_started', { fromStatus: 'submitted', toStatus: 'under_review' })
      const decidedAt = new Date()
      const [decision] = await database
        .insert(applicationDecisions)
        .values({
          applicationId: app.id,
          reportId: report.id,
          dossierId: dossier.id,
          officerId,
          officerName: officer.displayName,
          officerDesignation: officer.designation,
          decision: 'approved',
          note: null,
          signatureHash: computeApprovalSignatureHash(app.id, officerId, decidedAt),
          decidedAt,
        })
        .returning({ id: applicationDecisions.id })
      await event(officerId, 'officer', 'under_review', 'approved')
      await log(officerId, 'officer', 'application_approved', { fromStatus: 'under_review', toStatus: 'approved', decisionId: decision?.id })
      status = 'approved'
    }

    await database
      .update(applications)
      .set({ status, dossierId: dossier.id, districtId, blockId, assignedOfficerId: officerId, submittedAt: now, updatedAt: new Date() })
      .where(eq(applications.id, app.id))
    created.push(`${a.name} (${a.block}, ${status}${officerId ? '' : ', unassigned'})`)
  }

  return (
    `Role-flow demo: admin ${bootstrapped.join(' + ') || FALLBACK_ADMIN_PHONE}; ` +
    `officers ${DEMO_FLOW.officers.map((o) => `${o.displayName} ${o.phone}`).join(', ')}; ` +
    `applicants ${DEMO_FLOW.applicants.map((a) => a.phone).join(', ')}` +
    (created.length ? `; created applications: ${created.join('; ')}` : '; applications already present, left as-is')
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoFlow(db)
    .then((summary) => console.log(summary))
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => process.exit())
}
