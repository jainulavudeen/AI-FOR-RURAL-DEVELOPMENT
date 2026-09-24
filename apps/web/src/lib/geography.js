// Real, nationwide administrative reference data (GET /geography/states,
// /districts, /blocks) — see apps/api's ingestion/adminHierarchy/ for the
// source (SHRUG's Census 2011 redistribution: 35 states, 628 districts,
// ~5,900 real blocks/taluks/tehsils, real names — replacing the old
// 8-state mock catalogue and its numbered block_1/block_2/block_3
// placeholders). Every fetch here is cached in localStorage and read back
// on failure — this data is close to static (a state's district list
// doesn't change week to week), and CLAUDE.md rule 4 asks specifically
// for the user's own state's location picker to keep working offline
// once it's been loaded once.
import { authorizedFetch } from './auth'

const CACHE_PREFIX = 'setu:geography:'

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full/unavailable (private browsing, quota) — the live value
    // still renders this session, it just won't survive a reload offline.
  }
}

async function getJsonCached(path, cacheKey) {
  try {
    // authorizedFetch degrades to a plain fetch with no session — these
    // are public, unauthenticated routes, same as feasibility's other
    // reference GETs.
    const response = await authorizedFetch(path)
    if (!response.ok) return readCache(cacheKey) ?? []
    const data = await response.json()
    if (!Array.isArray(data)) return readCache(cacheKey) ?? []
    writeCache(cacheKey, data)
    return data
  } catch {
    return readCache(cacheKey) ?? []
  }
}

export async function getStates() {
  return getJsonCached('/geography/states', 'states')
}

export async function getDistricts(stateId) {
  if (!stateId) return []
  return getJsonCached(`/geography/districts?stateId=${encodeURIComponent(stateId)}`, `districts:${stateId}`)
}

export async function getBlocks(districtUuid) {
  if (!districtUuid) return []
  return getJsonCached(`/geography/blocks?districtUuid=${encodeURIComponent(districtUuid)}`, `blocks:${districtUuid}`)
}

// Best-effort match of a reverse-geocoded state/district name (real-world
// names from OSM Nominatim, e.g. "Tamil Nadu" / "Madurai") against the
// real nationwide catalogue above — same normalize-and-compare approach
// data/locations.js's matchLocationByName used for the old 8-state mock
// list, now genuinely nationwide instead of only ever resolving for 8
// states. A miss at either level honestly returns '' for that level
// rather than guessing — LocationDigipin.jsx already treats that as
// "location detected, not resolvable to a dropdown value," not an error.
const DIACRITICS_RE = /[̀-ͯ]/g

function normalizeForMatch(str) {
  return str
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/\b(district|division|region|taluk|taluka)\b/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function matchLocationByName(stateName, districtName) {
  const empty = { stateId: '', stateName: '', districtId: '', districtName: '', districtUuid: '' }
  if (!stateName) return empty

  const states = await getStates()
  const wantedState = normalizeForMatch(stateName)
  const matchedState = states.find((s) => s.id === wantedState)
  if (!matchedState) return empty

  if (!districtName) return { ...empty, stateId: matchedState.id, stateName: matchedState.name }

  const districts = await getDistricts(matchedState.id)
  const wantedDistrict = normalizeForMatch(districtName)
  const matchedDistrict = districts.find((d) => d.id === wantedDistrict)
  if (!matchedDistrict) return { ...empty, stateId: matchedState.id, stateName: matchedState.name }

  return {
    stateId: matchedState.id,
    stateName: matchedState.name,
    districtId: matchedDistrict.id,
    districtName: matchedDistrict.name,
    districtUuid: matchedDistrict.uuid,
  }
}
