// Required-documents checklists per scheme, for the /schemes "Required
// Documents" section. Values are i18n keys only — see translations.js's
// `document.*` tree for the actual text, kept parallel across en/hi/ta like
// every other UI string in this repo.
//
// Built from the same corpus schemeReferenceInfo.ts cites (see that file's
// header for which schemes were fetched live vs. leaned on secondary
// sourcing). Some entries below are conditional in reality (e.g. a caste
// certificate is only needed for PMEGP's higher special-category subsidy
// tier, not for every applicant) but are still listed — a document
// checklist that omits a document some applicants will actually be asked
// for is worse than one that occasionally over-asks; the implementing
// agency is always the final authority, and every card links to it.
//
// NSTFDC and Stand-Up India have no corpus document at all (see
// schemeReferenceInfo.ts) — there is nothing scheme-specific to cite for
// them, so they fall back to GENERIC_REQUIRED_DOCUMENTS (the handful of
// documents essentially every Indian small-business credit scheme asks
// for) rather than showing an empty checklist or inventing scheme-specific
// ones with nothing behind them.
export const GENERIC_REQUIRED_DOCUMENTS: string[] = [
  'document.aadhaarCard',
  'document.panCard',
  'document.passportPhoto',
  'document.bankPassbook',
  'document.businessProof',
]

export const SCHEME_DOCUMENT_REQUIREMENTS: Record<string, string[]> = {
  // Social (category-routed) schemes
  nsfdc: [...GENERIC_REQUIRED_DOCUMENTS, 'document.casteCertificate', 'document.incomeCertificate'],
  nbcfdc: [...GENERIC_REQUIRED_DOCUMENTS, 'document.casteCertificate', 'document.incomeCertificate'],
  nskfdc: [...GENERIC_REQUIRED_DOCUMENTS, 'document.safaiKaramchariCertificate'],
  nhfdc: [...GENERIC_REQUIRED_DOCUMENTS, 'document.disabilityCertificate'],
  dwbdnc_seed: [...GENERIC_REQUIRED_DOCUMENTS, 'document.dntCommunityCertificate'],

  // State schemes
  up_odop_margin_money: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof', 'document.gramPanchayatCertificate'],
  mh_cmegp: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof', 'document.projectReport'],
  tn_needs: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof', 'document.educationCertificate'],
  bihar_mukhyamantri_udyami_yojana: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof', 'document.educationCertificate'],
  rj_mysy: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof'],
  mp_mmyuy: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof'],
  wb_wbis2026: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof', 'document.udyamRegistration'],
  ka_udyogini: [...GENERIC_REQUIRED_DOCUMENTS, 'document.residenceProof', 'document.incomeCertificate'],

  // National schemes
  pmegp: [...GENERIC_REQUIRED_DOCUMENTS, 'document.projectReport', 'document.educationCertificate', 'document.casteCertificate'],
  pm_mudra: [...GENERIC_REQUIRED_DOCUMENTS, 'document.projectReport'],
  pm_svanidhi: [...GENERIC_REQUIRED_DOCUMENTS, 'document.vendingCertificate'],
  day_nrlm_shg: [...GENERIC_REQUIRED_DOCUMENTS, 'document.shgMembershipProof'],
}

export function getRequiredDocuments(schemeId: string): string[] {
  return SCHEME_DOCUMENT_REQUIREMENTS[schemeId] ?? GENERIC_REQUIRED_DOCUMENTS
}
