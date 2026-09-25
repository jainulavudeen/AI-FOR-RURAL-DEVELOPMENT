import type { AuditLogEntryInput } from '../../lib/auditLog.js'
import { ConflictError, NotFoundError, ValidationError, assertAdmin } from './service.js'

// Officer lifecycle — the only way an account becomes an officer. Admin
// invites by phone (the officer then signs in with phone OTP) and/or by
// Gmail (claimed on first Google sign-in), sets name + designation (which
// get frozen onto every approval that officer records), assigns the
// districts/blocks they cover, and can deactivate them. Every write here
// is audited.

export interface OfficerJurisdiction {
  districtId: string
  districtName: string
  stateCode: string
  blockId: string | null
  blockName: string | null
}

export interface OfficerView {
  id: string
  phone: string | null
  email: string | null
  invitedEmail: string | null
  displayName: string | null
  designation: string | null
  active: boolean
  jurisdictions: OfficerJurisdiction[]
  openApplications: number
}

export interface InviteOfficerBody {
  phone?: string
  email?: string
  displayName: string
  designation: string
}

export interface UpdateOfficerBody {
  displayName?: string
  designation?: string
  active?: boolean
}

export interface SetJurisdictionsBody {
  jurisdictions: Array<{ districtId: string; blockId?: string | null }>
}

export interface AccountRow {
  id: string
  role: string
  phone: string | null
  email: string | null
}

export interface OfficerDeps {
  listOfficerViews: () => Promise<OfficerView[]>
  findAccountByPhone: (phone: string) => Promise<AccountRow | null>
  findAccountByEmail: (email: string) => Promise<AccountRow | null>
  getAccountById: (id: string) => Promise<AccountRow | null>
  // Creates a new officer row, or promotes the given existing account.
  upsertOfficer: (input: {
    existingId: string | null
    phone: string | null
    invitedEmail: string | null
    displayName: string
    designation: string
  }) => Promise<string>
  updateOfficer: (id: string, patch: UpdateOfficerBody) => Promise<void>
  // Validates every (districtId, blockId) pair is real and the block sits
  // inside that district; returns the invalid entries (empty = all good).
  findInvalidJurisdictions: (entries: Array<{ districtId: string; blockId: string | null }>) => Promise<number[]>
  replaceJurisdictions: (officerId: string, adminId: string, entries: Array<{ districtId: string; blockId: string | null }>) => Promise<void>
  insertAuditLogEntry: (input: AuditLogEntryInput) => Promise<void>
}

const PHONE_FORMAT = /^\+[1-9]\d{7,14}$/
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function listOfficers(deps: OfficerDeps, requesterRole: string): Promise<OfficerView[]> {
  assertAdmin(requesterRole)
  return deps.listOfficerViews()
}

export async function inviteOfficer(deps: OfficerDeps, adminId: string, adminRole: string, body: InviteOfficerBody): Promise<{ id: string }> {
  assertAdmin(adminRole)
  const phone = body.phone?.trim() || null
  const email = body.email?.trim().toLowerCase() || null
  const displayName = body.displayName?.trim()
  const designation = body.designation?.trim()
  if (!phone && !email) throw new ValidationError('A phone number or a Gmail address is required')
  if (phone && !PHONE_FORMAT.test(phone)) throw new ValidationError('phone must be in +91XXXXXXXXXX form')
  if (email && !EMAIL_FORMAT.test(email)) throw new ValidationError('email is not valid')
  if (!displayName || !designation) throw new ValidationError('displayName and designation are required')

  const byPhone = phone ? await deps.findAccountByPhone(phone) : null
  const byEmail = email ? await deps.findAccountByEmail(email) : null
  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    throw new ConflictError('That phone and that email belong to two different existing accounts')
  }
  const existing = byPhone ?? byEmail
  if (existing?.role === 'admin') throw new ConflictError('That account is an admin; admins cannot be converted to officers here')

  // An email already attached to the existing account needs no invite.
  const invitedEmail = email && existing?.email !== email ? email : null
  const id = await deps.upsertOfficer({ existingId: existing?.id ?? null, phone, invitedEmail, displayName, designation })

  await deps.insertAuditLogEntry({
    actorId: adminId,
    actorRole: adminRole,
    action: existing ? 'officer_promoted' : 'officer_invited',
    targetType: 'officer',
    targetId: id,
    metadata: { phone, email, displayName, designation, previousRole: existing?.role ?? null },
  })
  return { id }
}

export async function updateOfficer(
  deps: OfficerDeps,
  adminId: string,
  adminRole: string,
  officerId: string,
  body: UpdateOfficerBody
): Promise<void> {
  assertAdmin(adminRole)
  const officer = await deps.getAccountById(officerId)
  if (!officer || officer.role !== 'officer') throw new NotFoundError('Officer not found')

  const patch: UpdateOfficerBody = {}
  if (body.displayName !== undefined) {
    if (!body.displayName.trim()) throw new ValidationError('displayName cannot be blank')
    patch.displayName = body.displayName.trim()
  }
  if (body.designation !== undefined) {
    if (!body.designation.trim()) throw new ValidationError('designation cannot be blank')
    patch.designation = body.designation.trim()
  }
  if (body.active !== undefined) patch.active = Boolean(body.active)
  if (Object.keys(patch).length === 0) throw new ValidationError('Nothing to update')

  await deps.updateOfficer(officerId, patch)
  await deps.insertAuditLogEntry({
    actorId: adminId,
    actorRole: adminRole,
    action: patch.active === false ? 'officer_deactivated' : patch.active === true ? 'officer_reactivated' : 'officer_updated',
    targetType: 'officer',
    targetId: officerId,
    metadata: { ...patch },
  })
}

// Replaces the officer's whole jurisdiction set. Changing jurisdiction
// never moves applications already assigned — only future submissions
// route by the new set; the admin reassigns existing ones explicitly.
export async function setJurisdictions(
  deps: OfficerDeps,
  adminId: string,
  adminRole: string,
  officerId: string,
  body: SetJurisdictionsBody
): Promise<void> {
  assertAdmin(adminRole)
  const officer = await deps.getAccountById(officerId)
  if (!officer || officer.role !== 'officer') throw new NotFoundError('Officer not found')
  if (!Array.isArray(body.jurisdictions)) throw new ValidationError('jurisdictions must be an array')

  const entries = body.jurisdictions.map((j) => ({ districtId: String(j.districtId ?? ''), blockId: j.blockId ? String(j.blockId) : null }))
  if (entries.some((e) => !e.districtId)) throw new ValidationError('Every jurisdiction needs a districtId')
  const invalid = await deps.findInvalidJurisdictions(entries)
  if (invalid.length > 0) throw new ValidationError(`Unknown district/block at position(s): ${invalid.join(', ')}`)

  await deps.replaceJurisdictions(officerId, adminId, entries)
  await deps.insertAuditLogEntry({
    actorId: adminId,
    actorRole: adminRole,
    action: 'officer_jurisdictions_set',
    targetType: 'officer',
    targetId: officerId,
    metadata: { jurisdictions: entries },
  })
}
