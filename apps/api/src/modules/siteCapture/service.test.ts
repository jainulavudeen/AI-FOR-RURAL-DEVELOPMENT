import { describe, expect, it, vi } from 'vitest'
import { createSiteCapture, getSiteCapturesForReport, ValidationError, ForbiddenError, MAX_PHOTO_DATA_URL_LENGTH } from './service'
import type { SiteCaptureDeps } from './service'
import type { SiteCapture } from './types'

const validBody = {
  reportId: null,
  digipin: '4T396F42L7',
  latitude: 13.1,
  longitude: 80.2,
  photoDataUrl: 'data:image/jpeg;base64,AAAA',
  consentAt: new Date().toISOString(),
}

function makeDeps(overrides: Partial<SiteCaptureDeps> = {}): SiteCaptureDeps {
  return {
    insertSiteCapture: vi.fn(async (input) => ({ id: 'capture-1', ...input, consentAt: input.consentAt.toISOString(), createdAt: new Date().toISOString() }) as SiteCapture),
    getSiteCapturesByReportId: vi.fn(async () => []),
    getReportOwner: vi.fn(async () => 'applicant-1'),
    ...overrides,
  }
}

describe('createSiteCapture', () => {
  it('rejects a body missing consentAt — no code path can insert without it', async () => {
    const deps = makeDeps()
    await expect(createSiteCapture(deps, 'applicant-1', { ...validBody, consentAt: '' })).rejects.toThrow(ValidationError)
    expect(deps.insertSiteCapture).not.toHaveBeenCalled()
  })

  it('rejects a photo that is not a data:image/ URL', async () => {
    const deps = makeDeps()
    await expect(createSiteCapture(deps, 'applicant-1', { ...validBody, photoDataUrl: 'not-an-image' })).rejects.toThrow(ValidationError)
  })

  it('rejects a photo over the server-side size backstop', async () => {
    const deps = makeDeps()
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PHOTO_DATA_URL_LENGTH)
    await expect(createSiteCapture(deps, 'applicant-1', { ...validBody, photoDataUrl: oversized })).rejects.toThrow(ValidationError)
  })

  it('saves successfully when consent, coordinates and a compressed photo are all present', async () => {
    const deps = makeDeps()
    const result = await createSiteCapture(deps, 'applicant-1', validBody)
    expect(result.id).toBe('capture-1')
    expect(deps.insertSiteCapture).toHaveBeenCalledWith(expect.objectContaining({ applicantId: 'applicant-1', digipin: validBody.digipin }))
  })

  it('refuses to attach a capture to a report the caller does not own', async () => {
    const deps = makeDeps({ getReportOwner: vi.fn(async () => 'someone-else') })
    await expect(createSiteCapture(deps, 'applicant-1', { ...validBody, reportId: 'report-1' })).rejects.toThrow(ForbiddenError)
  })
})

describe('getSiteCapturesForReport', () => {
  it('lets the owning applicant view their own report\'s captures', async () => {
    const deps = makeDeps({ getReportOwner: vi.fn(async () => 'applicant-1') })
    await expect(getSiteCapturesForReport(deps, 'applicant-1', 'applicant', 'report-1')).resolves.toEqual([])
  })

  it('refuses a non-owning applicant', async () => {
    const deps = makeDeps({ getReportOwner: vi.fn(async () => 'someone-else') })
    await expect(getSiteCapturesForReport(deps, 'applicant-1', 'applicant', 'report-1')).rejects.toThrow(ForbiddenError)
  })

  it('lets any officer view captures regardless of report ownership', async () => {
    const deps = makeDeps({ getReportOwner: vi.fn(async () => 'someone-else') })
    await expect(getSiteCapturesForReport(deps, 'officer-1', 'officer', 'report-1')).resolves.toEqual([])
  })
})
