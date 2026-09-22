// State-government flagship micro-enterprise/MSME schemes — one per state
// Setu's wizard supports (see apps/web/src/data/locations.js for the
// matching stateId list). Surfaced alongside the generic and social
// schemes once a state is selected in the wizard.
//
// Eligibility here checks state residency (and, for Karnataka's
// women-only Udyogini, the woman-owned flag) only — not every
// sub-criterion a real applicant must still satisfy (age band, education,
// income ceiling, project-cost tier). Those are surfaced as informational
// text (schemeReferenceInfo.ts's incomeCeilingNote, or a scheme's
// ministryNoteKey) rather than additional hard eligibility gates — the
// same simplification SOCIAL_SCHEMES already makes (e.g. NSFDC's real
// income ceiling is shown, not gated on).
//
// Every entry here is transcribed from real, sourced research — see
// apps/api/src/ingestion/schemeDocuments/corpus/*.json for the matching
// corpus documents and CLAUDE.md's boundary rule 3 (every claim needs a
// source and a data-vintage). Where a state's own official portal could
// not be reached this session, sourceCaveat in schemeReferenceInfo.ts
// records the fallback honestly, matching this repo's existing pattern
// for NSKFDC/SEED/Jan Samarth.
export interface StateScheme {
  id: string
  stateId: string
  icon: string
  nameKey: string
  descKey: string
  ministryNoteKey: string | null
  // Some state flagship schemes are themselves women-only (e.g. Karnataka's
  // Udyogini) — a second, independent gate alongside the state match, not
  // modelled by squeezing it into SOCIAL_SCHEMES since it isn't a
  // category-based corporation.
  womenOnly?: boolean
}

export const STATE_SCHEMES: StateScheme[] = [
  {
    id: 'up_odop_margin_money',
    stateId: 'uttar_pradesh',
    icon: 'Landmark',
    nameKey: 'stateScheme.up_odop_margin_money.name',
    descKey: 'stateScheme.up_odop_margin_money.desc',
    ministryNoteKey: null,
  },
  {
    id: 'mh_cmegp',
    stateId: 'maharashtra',
    icon: 'Landmark',
    nameKey: 'stateScheme.mh_cmegp.name',
    descKey: 'stateScheme.mh_cmegp.desc',
    ministryNoteKey: null,
  },
  {
    id: 'tn_needs',
    stateId: 'tamil_nadu',
    icon: 'Landmark',
    nameKey: 'stateScheme.tn_needs.name',
    descKey: 'stateScheme.tn_needs.desc',
    ministryNoteKey: null,
  },
  {
    id: 'bihar_mukhyamantri_udyami_yojana',
    stateId: 'bihar',
    icon: 'Landmark',
    nameKey: 'stateScheme.bihar_mukhyamantri_udyami_yojana.name',
    descKey: 'stateScheme.bihar_mukhyamantri_udyami_yojana.desc',
    ministryNoteKey: 'stateScheme.bihar_mukhyamantri_udyami_yojana.ministryNote',
  },
  {
    id: 'rj_mysy',
    stateId: 'rajasthan',
    icon: 'Landmark',
    nameKey: 'stateScheme.rj_mysy.name',
    descKey: 'stateScheme.rj_mysy.desc',
    ministryNoteKey: null,
  },
  {
    id: 'mp_mmyuy',
    stateId: 'madhya_pradesh',
    icon: 'Landmark',
    nameKey: 'stateScheme.mp_mmyuy.name',
    descKey: 'stateScheme.mp_mmyuy.desc',
    ministryNoteKey: 'stateScheme.mp_mmyuy.ministryNote',
  },
  {
    id: 'wb_wbis2026',
    stateId: 'west_bengal',
    icon: 'Landmark',
    nameKey: 'stateScheme.wb_wbis2026.name',
    descKey: 'stateScheme.wb_wbis2026.desc',
    ministryNoteKey: 'stateScheme.wb_wbis2026.ministryNote',
  },
  {
    id: 'ka_udyogini',
    stateId: 'karnataka',
    icon: 'Landmark',
    nameKey: 'stateScheme.ka_udyogini.name',
    descKey: 'stateScheme.ka_udyogini.desc',
    ministryNoteKey: null,
    womenOnly: true,
  },
]

export function getMatchingStateSchemes(stateId: string | null | undefined): StateScheme[] {
  if (!stateId) return []
  return STATE_SCHEMES.filter((s) => s.stateId === stateId)
}
