import { env } from '../config/env.js'
import { sha256Hex } from './hash.js'

// "Verified Approval", not a digital signature — this repo has no
// government DSC (Digital Signature Certificate) integration, and the UI
// and printed document must never claim one. This is a tamper-evident
// hash of (subject id + officer id + approval timestamp + server secret):
// it can't be forged without APPROVAL_SIGNING_SECRET, and a bank checks
// it against our records at the public GET /applications/verify/:hash
// (the dossier's QR code links there). `subjectId` is the application id
// for approvals recorded through modules/applications; hashes issued by
// the retired standalone dossier approval used the dossier id.
export function computeApprovalSignatureHash(subjectId: string, officerId: string, approvedAt: Date): string {
  return sha256Hex(`${subjectId}:${officerId}:${approvedAt.toISOString()}:${env.APPROVAL_SIGNING_SECRET}`)
}
