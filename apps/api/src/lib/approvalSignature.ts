import { env } from '../config/env.js'
import { sha256Hex } from './hash.js'

// "Verified Approval", not a digital signature — this repo has no
// government DSC (Digital Signature Certificate) integration, and
// CLAUDE.md item 7 is explicit: never claim one. This is a tamper-evident
// hash a bank can re-derive and check against our records (see
// GET /bank-dossier/verify/:hash), not a legally-recognized e-signature.
export function computeApprovalSignatureHash(dossierId: string, officerId: string, approvedAt: Date): string {
  return sha256Hex(`${dossierId}:${officerId}:${approvedAt.toISOString()}:${env.APPROVAL_SIGNING_SECRET}`)
}
