// Real, sourced application facts for the category-based social schemes —
// income ceilings, the largest amount the source states, how to apply, and
// a citation with data-vintage. Transcribed from
// apps/api/src/ingestion/schemeDocuments/corpus/*.json, the same
// hand-curated corpus the grounding module's RAG pipeline retrieves from
// (see CLAUDE.md's Known Gaps for which of these were fetched live vs.
// leaned on secondary sourcing — sourceCaveat below mirrors that).
//
// Deliberately not present for every SOCIAL_SCHEMES entry: NSTFDC and
// Stand-Up India have no corpus document (no successful fetch was ever
// made for them), so there is nothing real to cite yet — the UI must
// degrade to name/description only for those two, never invent figures.
//
// Static reference data, not live retrieval — same "static default" status
// as schemes.ts/socialSchemes.ts. Once grounding's real corpus/RAG path is
// the source of truth for this content, this file becomes redundant with
// it; until then it's what makes the offline client's eligibility screen
// show real citations with no network call.
export interface SchemeReference {
  schemeId: string
  // Annual family/household income ceiling in INR, where the source states
  // one as a blanket eligibility condition. Null when the source states no
  // such condition (age- or component-based instead) — never guessed.
  annualIncomeCeiling: number | null
  // The largest loan/project-cost figure the source states, whatever it's
  // actually a ceiling on (loan amount vs. sanctioned project cost varies
  // by scheme) — always shown with a neutral "up to" label, never labelled
  // "loan cap" specifically, since the source isn't always that precise.
  maxAmount: number | null
  howToApplyKey: string
  // An ordered, numbered breakdown of howToApplyKey's single prose
  // sentence, where the source is clear enough about the actual process
  // stages to structure it honestly (portal → verifying body → sanctioning
  // bank, for example). Deliberately not populated for every scheme — see
  // this file's header — the UI falls back to the howToApplyKey prose when
  // absent rather than inventing steps a source didn't actually spell out.
  applyStepKeys?: string[]
  sourceUrl: string
  vintageLabel: string
  // 'mirror' = official site unreachable, sourced via a state agency's
  // republication of the same national terms. 'secondary' = corroborated
  // via independent public summaries rather than one directly-fetched
  // primary page. Null = fetched live from the scheme's own official page.
  sourceCaveat: 'mirror' | 'secondary' | null
}

export const SCHEME_REFERENCES: Record<string, SchemeReference> = {
  nsfdc: {
    schemeId: 'nsfdc',
    annualIncomeCeiling: 500000,
    maxAmount: null,
    howToApplyKey: 'socialScheme.nsfdc.howToApply',
    sourceUrl: 'https://nsfdc.nic.in/eligibility-requirements',
    vintageLabel: 'as of 7 January 2026',
    sourceCaveat: null,
  },
  nbcfdc: {
    schemeId: 'nbcfdc',
    annualIncomeCeiling: 500000,
    maxAmount: 2500000,
    howToApplyKey: 'socialScheme.nbcfdc.howToApply',
    sourceUrl: 'https://www.nbcfdc.gov.in/nbcfdc/web/en/individual-loan-scheme',
    vintageLabel: 'as of 2026',
    sourceCaveat: null,
  },
  nskfdc: {
    schemeId: 'nskfdc',
    annualIncomeCeiling: null,
    maxAmount: 500000,
    howToApplyKey: 'socialScheme.nskfdc.howToApply',
    sourceUrl: 'https://himachalservices.nic.in/hpscstdc/Sch-NSKFDCEng.htm',
    vintageLabel: 'as retrieved via HPSCSTDC mirror, 2026',
    sourceCaveat: 'mirror',
  },
  nhfdc: {
    schemeId: 'nhfdc',
    annualIncomeCeiling: null,
    maxAmount: 5000000,
    howToApplyKey: 'socialScheme.nhfdc.howToApply',
    sourceUrl: 'https://ndfdc.nic.in/how-to-obtain-loan',
    vintageLabel: 'as of 2026',
    sourceCaveat: null,
  },
  dwbdnc_seed: {
    schemeId: 'dwbdnc_seed',
    // The corpus's income ceiling (Rs. 8 lakh) applies only to the
    // free-coaching component, not the livelihood component relevant to a
    // business loan context — showing it as a blanket ceiling would
    // mischaracterize the source, so this is left null.
    annualIncomeCeiling: null,
    maxAmount: null,
    howToApplyKey: 'socialScheme.dwbdnc_seed.howToApply',
    sourceUrl: 'https://dwbdnc.dosje.gov.in/public/images/SEED_scheme_guidlines.pdf',
    vintageLabel: 'SEED Scheme, launched 16 February 2022',
    sourceCaveat: 'secondary',
  },

  // State schemes (STATE_SCHEMES) — one flagship scheme per state.
  up_odop_margin_money: {
    schemeId: 'up_odop_margin_money',
    annualIncomeCeiling: null,
    maxAmount: 625000,
    howToApplyKey: 'stateScheme.up_odop_margin_money.howToApply',
    applyStepKeys: [
      'stateScheme.up_odop_margin_money.applyStep1',
      'stateScheme.up_odop_margin_money.applyStep2',
      'stateScheme.up_odop_margin_money.applyStep3',
    ],
    sourceUrl: 'https://msme1connect.up.gov.in/scheme-list/financial-assistance-scheme-for-one-district-one-product-(odop-margin-money-scheme)',
    vintageLabel: 'as of 20 September 2026',
    sourceCaveat: null,
  },
  mh_cmegp: {
    schemeId: 'mh_cmegp',
    annualIncomeCeiling: null,
    maxAmount: 5000000,
    howToApplyKey: 'stateScheme.mh_cmegp.howToApply',
    sourceUrl: 'https://bankofmaharashtra.bank.in/cmegp',
    vintageLabel: 'as retrieved via secondary corroboration, 20 September 2026',
    sourceCaveat: 'secondary',
  },
  tn_needs: {
    schemeId: 'tn_needs',
    annualIncomeCeiling: null,
    maxAmount: 7500000,
    howToApplyKey: 'stateScheme.tn_needs.howToApply',
    sourceUrl: 'https://en.vikaspedia.in/viewcontent/schemesall/state-specific-schemes/tamil-nadu/new-entrepreneur-cum-enterprise-development-scheme',
    vintageLabel: 'as retrieved via secondary corroboration, 20 September 2026',
    sourceCaveat: 'secondary',
  },
  bihar_mukhyamantri_udyami_yojana: {
    schemeId: 'bihar_mukhyamantri_udyami_yojana',
    annualIncomeCeiling: null,
    maxAmount: 1000000,
    howToApplyKey: 'stateScheme.bihar_mukhyamantri_udyami_yojana.howToApply',
    sourceUrl: 'https://udyami.bihar.gov.in',
    vintageLabel: 'as retrieved via secondary corroboration, 20 September 2026',
    sourceCaveat: 'secondary',
  },
  rj_mysy: {
    schemeId: 'rj_mysy',
    annualIncomeCeiling: null,
    maxAmount: 1000000,
    howToApplyKey: 'stateScheme.rj_mysy.howToApply',
    sourceUrl: 'https://www.govtschemes.in/rajasthan-mukhyamantri-yuva-swarojgar-yojana',
    vintageLabel: 'as of September 2026 (scheme launched 12 January 2026)',
    sourceCaveat: 'secondary',
  },
  mp_mmyuy: {
    schemeId: 'mp_mmyuy',
    annualIncomeCeiling: null,
    maxAmount: 20000000,
    howToApplyKey: 'stateScheme.mp_mmyuy.howToApply',
    sourceUrl: 'http://www.merayuva.mp.gov.in/scheme/mukhya-mantri-yuva-udyami-yojana',
    vintageLabel: 'as of 2026 (scheme launched August 2014)',
    sourceCaveat: 'secondary',
  },
  wb_wbis2026: {
    schemeId: 'wb_wbis2026',
    annualIncomeCeiling: null,
    // Its real numbers are all percentages (interest subsidy %, electricity
    // duty waiver %) plus a per-cluster cap (Rs. 5 crore, shared across many
    // beneficiaries) — no single per-applicant "up to" amount the source
    // states, so showing one here would overstate what an individual
    // applicant actually gets. Left null deliberately.
    maxAmount: null,
    howToApplyKey: 'stateScheme.wb_wbis2026.howToApply',
    sourceUrl: 'https://knnindia.co.in/news/newsdetails/msme/west-bengal-approves-wbis-2026-msme-incentive-scheme-with-interest-and-power-subsidies',
    vintageLabel: 'as of September 2026 (approved; takes effect 1 October 2026)',
    sourceCaveat: 'secondary',
  },
  ka_udyogini: {
    schemeId: 'ka_udyogini',
    // The general/special-category ceiling; SC/ST applicants have a higher
    // Rs. 2,00,000 ceiling per the source — the lower, more restrictive
    // figure is shown as the headline rather than the more favourable one.
    annualIncomeCeiling: 150000,
    maxAmount: 300000,
    howToApplyKey: 'stateScheme.ka_udyogini.howToApply',
    sourceUrl: 'https://kswdc.karnataka.gov.in/21/udyogini/en',
    vintageLabel: 'as of September 2026, fetched live from kswdc.karnataka.gov.in',
    sourceCaveat: null,
  },

  // National schemes (NATIONAL_SCHEMES). pm_mudra and pmegp already gate on
  // a real project-cost band (see nationalSchemes.ts), so the fact chip on
  // their card comes from that band, not maxAmount here — left null to
  // avoid showing a redundant, differently-derived number.
  pmegp: {
    schemeId: 'pmegp',
    annualIncomeCeiling: null,
    maxAmount: null,
    howToApplyKey: 'nationalScheme.pmegp.howToApply',
    applyStepKeys: ['nationalScheme.pmegp.applyStep1', 'nationalScheme.pmegp.applyStep2', 'nationalScheme.pmegp.applyStep3'],
    sourceUrl: 'https://www.msme.gov.in/1-prime-ministers-employment-generation-programme-pmegp',
    vintageLabel: 'as of 20 September 2026',
    sourceCaveat: 'secondary',
  },
  pm_mudra: {
    schemeId: 'pm_mudra',
    annualIncomeCeiling: null,
    maxAmount: null,
    howToApplyKey: 'nationalScheme.pm_mudra.howToApply',
    applyStepKeys: ['nationalScheme.pm_mudra.applyStep1', 'nationalScheme.pm_mudra.applyStep2'],
    sourceUrl: 'https://www.jansamarth.in/business-loan-pradhan-mantri-mudra-yojana-scheme',
    vintageLabel: 'as of 2026 (Tarun Plus tier reflects the 2023 Union Budget expansion)',
    sourceCaveat: 'secondary',
  },
  pm_svanidhi: {
    schemeId: 'pm_svanidhi',
    annualIncomeCeiling: null,
    maxAmount: 50000,
    howToApplyKey: 'nationalScheme.pm_svanidhi.howToApply',
    applyStepKeys: ['nationalScheme.pm_svanidhi.applyStep1', 'nationalScheme.pm_svanidhi.applyStep2'],
    sourceUrl: 'https://pmsvanidhi.mohua.gov.in/',
    vintageLabel: 'as of 20 September 2026',
    sourceCaveat: 'secondary',
  },
  day_nrlm_shg: {
    schemeId: 'day_nrlm_shg',
    annualIncomeCeiling: null,
    maxAmount: 1000000,
    howToApplyKey: 'nationalScheme.day_nrlm_shg.howToApply',
    applyStepKeys: ['nationalScheme.day_nrlm_shg.applyStep1', 'nationalScheme.day_nrlm_shg.applyStep2'],
    sourceUrl: 'https://bankofmaharashtra.bank.in/financing-to-self-help-groups',
    vintageLabel: 'as of 20 September 2026',
    sourceCaveat: 'secondary',
  },
}
