import type { CreateSiteCaptureBody, SiteAddressSource, SiteCapture } from './types.js'

// A base64 data URL runs ~33% larger than the underlying bytes — 400 KB of
// encoded text is roughly a 300 KB JPEG, already generous for what
// lib/imageCompress.js's client-side downscale-and-recompress produces
// (see apps/web/src/lib/imageCompress.js). This is a server-side backstop,
// not the primary size control: "compress hard before upload" is a client
// job, but the server shouldn't blindly trust it either.
export const MAX_PHOTO_DATA_URL_LENGTH = 400 * 1024
export const MAX_CONFIRMED_ADDRESS_LENGTH = 300
const ADDRESS_SOURCES: SiteAddressSource[] = ['user_confirmed', 'user_corrected', 'user_entered']

export class ValidationError extends Error {
  statusCode = 400
  code = 'BAD_REQUEST'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
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

export interface SiteCaptureDeps {
  insertSiteCapture: (input: {
    applicantId: string
    reportId: string | null
    digipin: string
    latitude: number
    longitude: number
    photoDataUrl: string
    consentAt: Date
    confirmedAddress: string | null
    addressSource: SiteAddressSource | null
  }) => Promise<SiteCapture>
  getSiteCapturesByReportId: (reportId: string) => Promise<SiteCapture[]>
  getReportOwner: (reportId: string) => Promise<string | null>
  // Optional so existing test stubs stay short; absent = no officer access.
  officerCanSeeReport?: (reportId: string, officerId: string) => Promise<boolean>
}

function validate(body: CreateSiteCaptureBody): void {
  if (!body.digipin || !body.consentAt) {
    throw new ValidationError('digipin and consentAt are required')
  }
  if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    throw new ValidationError('latitude and longitude must be numbers')
  }
  if (!body.photoDataUrl || !body.photoDataUrl.startsWith('data:image/')) {
    throw new ValidationError('photoDataUrl must be an image data URL')
  }
  if (body.photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
    throw new ValidationError(
      `photoDataUrl exceeds ${MAX_PHOTO_DATA_URL_LENGTH} bytes — compress further before uploading`
    )
  }
  const address = body.confirmedAddress?.trim()
  if (address) {
    if (address.length > MAX_CONFIRMED_ADDRESS_LENGTH) {
      throw new ValidationError(`confirmedAddress must be at most ${MAX_CONFIRMED_ADDRESS_LENGTH} characters`)
    }
    // An address with no stated source can't be told apart from a raw
    // Google suggestion, so it isn't accepted.
    if (!body.addressSource || !ADDRESS_SOURCES.includes(body.addressSource)) {
      throw new ValidationError(`addressSource must be one of ${ADDRESS_SOURCES.join(', ')} when confirmedAddress is set`)
    }
  }
}

// Consent is enforced structurally, not just validated: there is no
// insertSiteCapture call anywhere in this file that isn't preceded by this
// check, and consentAt (the client's own recorded consent timestamp) is
// what gets persisted — never a server-side "consented: true" flag with no
// evidence behind it.
export async function createSiteCapture(deps: SiteCaptureDeps, applicantId: string, body: CreateSiteCaptureBody): Promise<SiteCapture> {
  validate(body)

  if (body.reportId) {
    const owner = await deps.getReportOwner(body.reportId)
    if (owner !== applicantId) {
      throw new ForbiddenError('Cannot attach a site capture to a report you do not own')
    }
  }

  return deps.insertSiteCapture({
    applicantId,
    reportId: body.reportId ?? null,
    digipin: body.digipin,
    latitude: body.latitude,
    longitude: body.longitude,
    photoDataUrl: body.photoDataUrl,
    consentAt: new Date(body.consentAt),
    confirmedAddress: body.confirmedAddress?.trim() || null,
    addressSource: body.confirmedAddress?.trim() ? (body.addressSource ?? null) : null,
  })
}

// Visible to the report's own applicant, any admin, or an officer the
// report's application/appeal is assigned to (lib/officerAccess.ts) —
// never "any officer".
export async function getSiteCapturesForReport(
  deps: SiteCaptureDeps,
  requesterId: string,
  requesterRole: string,
  reportId: string
): Promise<SiteCapture[]> {
  if (requesterRole === 'officer') {
    if (!(await deps.officerCanSeeReport?.(reportId, requesterId))) {
      throw new ForbiddenError('This report is not assigned to you')
    }
  } else if (requesterRole !== 'admin') {
    const owner = await deps.getReportOwner(reportId)
    if (owner !== requesterId) {
      throw new ForbiddenError('Cannot view site captures for a report you do not own')
    }
  }
  return deps.getSiteCapturesByReportId(reportId)
}
