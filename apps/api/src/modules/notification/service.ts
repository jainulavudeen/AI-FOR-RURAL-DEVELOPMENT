import { isMaterialSchemeChange, describeSchemeChange, type SchemeRuleSnapshot } from './schemeChangeDiff'
import type { NotificationChannel, NotificationProvider } from './types'

export class NotFoundError extends Error {
  statusCode = 404
  code = 'NOT_FOUND'
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  statusCode = 403
  code = 'FORBIDDEN'
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export interface NotificationDeps {
  providers: Record<NotificationChannel, NotificationProvider>
  getApplicantPhone: (applicantId: string) => Promise<string | null>
  getApplicantIdsMatchedToScheme: (schemeId: string) => Promise<string[]>
}

// EMI reminders and scheme-change alerts both funnel through this one
// send — "all three [channels] behind one interface" means every caller
// here is channel-agnostic; picking sms vs whatsapp vs push is just which
// key of deps.providers gets used.
export async function sendNotification(
  deps: NotificationDeps,
  applicantId: string,
  channel: NotificationChannel,
  message: string
): Promise<{ sent: true }> {
  const phone = await deps.getApplicantPhone(applicantId)
  if (!phone) throw new NotFoundError(`No applicant found for id "${applicantId}"`)
  await deps.providers[channel].send({ phone, message })
  return { sent: true }
}

export interface SchemeChangeNotificationResult {
  materialChange: boolean
  message: string | null
  notifiedCount: number
  failedCount: number
}

// Diffs two scheme_rules versions and, only on a material change (rate or
// cap — see schemeChangeDiff.ts), notifies every applicant whose most
// recent report matched that scheme. One applicant's send failing doesn't
// stop the rest — this is a best-effort broadcast, not a transaction.
export async function notifySchemeChange(
  deps: NotificationDeps,
  oldRule: SchemeRuleSnapshot,
  newRule: SchemeRuleSnapshot,
  channel: NotificationChannel = 'sms'
): Promise<SchemeChangeNotificationResult> {
  if (!isMaterialSchemeChange(oldRule, newRule)) {
    return { materialChange: false, message: null, notifiedCount: 0, failedCount: 0 }
  }

  const message = describeSchemeChange(oldRule, newRule)
  const applicantIds = await deps.getApplicantIdsMatchedToScheme(newRule.schemeId)

  let notifiedCount = 0
  let failedCount = 0
  for (const applicantId of applicantIds) {
    try {
      await sendNotification(deps, applicantId, channel, message)
      notifiedCount += 1
    } catch {
      failedCount += 1
    }
  }

  return { materialChange: true, message, notifiedCount, failedCount }
}
