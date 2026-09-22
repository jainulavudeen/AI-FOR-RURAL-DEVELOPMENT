// Plain-English scheme names for contexts with no i18n resolution
// available at all — apps/web/src/i18n/translations.js (via each scheme's
// nameKey) is the real source of truth for user-facing text; this is a
// deliberately minimal, English-only mirror for server-side contexts that
// have no locale-aware rendering layer (an LLM prompt's plain-text claims,
// a PDF generation fallback) and therefore can't resolve a nameKey at all.
// Never shown to a user directly — only ever fed to a model or a document
// generator that itself decides the final on-screen language.
export const SCHEME_ENGLISH_LABELS: Record<string, string> = {
  micro_finance: 'Micro Finance',
  term_loan: 'Term Loan',
  nsfdc: 'NSFDC — National Scheduled Castes Finance & Development Corporation',
  nstfdc: 'NSTFDC — National Scheduled Tribes Finance & Development Corporation',
  nbcfdc: 'NBCFDC — National Backward Classes Finance & Development Corporation',
  nskfdc: 'NSKFDC — National Safai Karamcharis Finance & Development Corporation',
  nhfdc: 'NHFDC — National Divyangjan Finance & Development Corporation',
  dwbdnc_seed: 'SEED — Scheme for Economic Empowerment of DNTs',
  stand_up_india: 'Stand-Up India',
  up_odop_margin_money: 'UP ODOP Margin Money Scheme',
  mh_cmegp: "Chief Minister's Employment Generation Programme (CMEGP)",
  tn_needs: 'New Entrepreneur-cum-Enterprise Development Scheme (NEEDS)',
  bihar_mukhyamantri_udyami_yojana: 'Mukhyamantri Udyami Yojana',
  rj_mysy: 'Mukhyamantri Yuva Swarozgar Yojana',
  mp_mmyuy: 'Mukhya Mantri Yuva Udyami Yojana',
  wb_wbis2026: 'WBIS 2026 MSME Incentive Scheme',
  ka_udyogini: 'Udyogini Scheme',
  pmegp: "Prime Minister's Employment Generation Programme (PMEGP)",
  pm_mudra: 'PM MUDRA Yojana',
  pm_svanidhi: 'PM SVANidhi',
  day_nrlm_shg: 'DAY-NRLM SHG Bank Linkage',
}

export function schemeEnglishLabel(schemeId: string): string {
  return SCHEME_ENGLISH_LABELS[schemeId] ?? schemeId
}
