// Central-government schemes that apply nationwide (not routed by
// project-cost band like SCHEMES, nor by social category like
// SOCIAL_SCHEMES, nor by state like STATE_SCHEMES).
//
// A scheme with a real project-cost band the source states
// (projectCostMin/Max set) is gated by it, same as SCHEMES. A scheme
// whose real eligibility gate is something Setu's wizard doesn't capture
// (SHG membership for DAY-NRLM, street-vendor status for PM SVANidhi) is
// left ungated (both null) — eligibility.ts surfaces that as "check
// manually" rather than a false eligible/ineligible claim.
//
// PMEGP's real project-cost cap differs by manufacturing (Rs. 50 lakh) vs.
// service/trading (Rs. 20 lakh); Setu's eligibility model doesn't split by
// business type anywhere else either (SCHEMES' generic bands don't), so
// the higher figure is used as a single conservative gate — same
// simplification, not a new one.
//
// Every entry here is transcribed from real, sourced research — see
// apps/api/src/ingestion/schemeDocuments/corpus/*.json (pm_mudra's terms
// live in the pre-existing jan_samarth.json) and CLAUDE.md's boundary
// rule 3.
export interface NationalScheme {
  id: string
  icon: string
  nameKey: string
  descKey: string
  ministryNoteKey: string | null
  projectCostMin: number | null
  projectCostMax: number | null
}

export const NATIONAL_SCHEMES: NationalScheme[] = [
  {
    id: 'pmegp',
    icon: 'Landmark',
    nameKey: 'nationalScheme.pmegp.name',
    descKey: 'nationalScheme.pmegp.desc',
    ministryNoteKey: null,
    projectCostMin: 0,
    projectCostMax: 5000000,
  },
  {
    id: 'pm_mudra',
    icon: 'HandCoins',
    nameKey: 'nationalScheme.pm_mudra.name',
    descKey: 'nationalScheme.pm_mudra.desc',
    ministryNoteKey: null,
    projectCostMin: 0,
    projectCostMax: 2000000,
  },
  {
    id: 'pm_svanidhi',
    icon: 'HandCoins',
    nameKey: 'nationalScheme.pm_svanidhi.name',
    descKey: 'nationalScheme.pm_svanidhi.desc',
    ministryNoteKey: 'nationalScheme.pm_svanidhi.ministryNote',
    projectCostMin: null,
    projectCostMax: null,
  },
  {
    id: 'day_nrlm_shg',
    icon: 'Users',
    nameKey: 'nationalScheme.day_nrlm_shg.name',
    descKey: 'nationalScheme.day_nrlm_shg.desc',
    ministryNoteKey: 'nationalScheme.day_nrlm_shg.ministryNote',
    projectCostMin: null,
    projectCostMax: null,
  },
]
