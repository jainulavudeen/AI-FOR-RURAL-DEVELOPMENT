// Geotagged site-capture uploads — coupled to apps/web/vite.config.js's
// runtimeCaching entry for POST /site-capture (Workbox background sync),
// same "a thrown fetch here is only safe to report as queued because the
// service worker genuinely queues it" contract as lib/feedback.js's
// postQueueable. If either changes, check the other.
import { authorizedFetch } from './auth'

export async function uploadSiteCapture({ reportId, digipin, latitude, longitude, photoDataUrl, consentAt, confirmedAddress = null, addressSource = null }) {
  try {
    const response = await authorizedFetch('/site-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, digipin, latitude, longitude, photoDataUrl, consentAt, confirmedAddress, addressSource }),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data, queued: false }
  } catch {
    return { ok: true, status: 0, data: {}, queued: true }
  }
}
