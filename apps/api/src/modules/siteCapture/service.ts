import type { CreateSiteCaptureBody, SiteCapture } from './types'

// A base64 data URL runs ~33% larger than the underlying bytes — 400 KB of
// encoded text is roughly a 300 KB JPEG, already generous for what
// lib/imageCompress.js's client-side downscale-and-recompress produces
// (see apps/web/src/lib/imageCompress.js). This is a server-side backstop,
// not the primary size control: "compress hard before upload" is a client
// job, but the server shouldn't blindly trust it either.
export const MAX_PHOTO_DATA_URL_LENGTH = 400 * 1024

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
  }) => Promise<SiteCapture>
  getSiteCapturesByReportId: (reportId: string) => Promise<SiteCapture[]>
  getReportOwner: (reportId: string) => Promise<string | null>
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
  })
}

// Visible to the report's own applicant, or to any officer (same loose
// "any officer can see any assigned queue's evidence" posture the rest of
// the officer-facing surface already uses — see feedback/service.ts).
export async function getSiteCapturesForReport(
  deps: SiteCaptureDeps,
  requesterId: string,
  requesterRole: string,
  reportId: string
): Promise<SiteCapture[]> {
  if (requesterRole !== 'officer') {
    const owner = await deps.getReportOwner(reportId)
    if (owner !== requesterId) {
      throw new ForbiddenError('Cannot view site captures for a report you do not own')
    }
  }
  return deps.getSiteCapturesByReportId(reportId)
}
