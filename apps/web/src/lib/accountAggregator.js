// The Account Aggregator opt-in flow — see
// apps/api/src/modules/accountAggregator. Every route is gated behind
// fastify.authenticate (this is a "saving" action, not informational), so
// every call here goes through authorizedFetch, same as lib/feedback.js.
// Never queued for background sync (unlike feedback.js's flag/appeal) —
// this is a synchronous opt-in flow the user is actively waiting on, not
// a fire-and-forget write, so a network failure here is a real error to
// show, not a "queued" success.

import { authorizedFetch } from './auth'

const CONSENT_SCOPE = {
  fiTypes: ['DEPOSIT'],
  purposeCode: '101',
  purposeText: 'Margin capital verification for a Setu financing report',
  dataRangeFrom: '',
  dataRangeTo: '',
  fetchType: 'ONETIME',
}

function sixMonthsAgo() {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export async function requestAaConsent() {
  try {
    const response = await authorizedFetch('/account-aggregator/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: { ...CONSENT_SCOPE, dataRangeFrom: sixMonthsAgo(), dataRangeTo: today() } }),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function getAaConsentStatus(consentId) {
  try {
    const response = await authorizedFetch(`/account-aggregator/consent/${consentId}`)
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function fetchAaMargin(consentId, purpose) {
  try {
    const response = await authorizedFetch(`/account-aggregator/consent/${consentId}/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose }),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}
