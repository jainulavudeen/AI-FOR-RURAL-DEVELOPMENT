// Category-specific credit corporations run under (or adjacent to) India's
// Ministry of Social Justice & Empowerment. Surfaced alongside the generic
// Micro Finance / Term Loan scheme when an applicant optionally discloses a
// mandate category. Disclosure is always optional — "prefer not to say" is
// the default and never blocks the report.

export interface SocialCategory {
  id: string
  labelKey: string
}

export const SOCIAL_CATEGORIES: SocialCategory[] = [
  { id: 'general', labelKey: 'category.general' },
  { id: 'sc', labelKey: 'category.sc' },
  { id: 'st', labelKey: 'category.st' },
  { id: 'obc', labelKey: 'category.obc' },
  { id: 'safai_karamcharis', labelKey: 'category.safai_karamcharis' },
  { id: 'disability', labelKey: 'category.disability' },
  { id: 'dnt', labelKey: 'category.dnt' },
  { id: 'prefer_not_to_say', labelKey: 'category.prefer_not_to_say' },
]

export interface SocialScheme {
  id: string
  icon: string
  nameKey: string
  descKey: string
  ministryNoteKey: string | null
  categories: string[]
  alsoForWomen?: boolean
}

// Each corporation lists which category ids it applies to, plus whether a
// woman-owned enterprise flag also qualifies it (Stand-Up India).
export const SOCIAL_SCHEMES: SocialScheme[] = [
  {
    id: 'nsfdc',
    icon: 'Landmark',
    nameKey: 'socialScheme.nsfdc.name',
    descKey: 'socialScheme.nsfdc.desc',
    ministryNoteKey: null,
    categories: ['sc'],
  },
  {
    id: 'nstfdc',
    icon: 'Landmark',
    nameKey: 'socialScheme.nstfdc.name',
    descKey: 'socialScheme.nstfdc.desc',
    ministryNoteKey: 'socialScheme.nstfdc.ministryNote',
    categories: ['st'],
  },
  {
    id: 'nbcfdc',
    icon: 'Landmark',
    nameKey: 'socialScheme.nbcfdc.name',
    descKey: 'socialScheme.nbcfdc.desc',
    ministryNoteKey: null,
    categories: ['obc'],
  },
  {
    id: 'nskfdc',
    icon: 'Landmark',
    nameKey: 'socialScheme.nskfdc.name',
    descKey: 'socialScheme.nskfdc.desc',
    ministryNoteKey: null,
    categories: ['safai_karamcharis'],
  },
  {
    id: 'nhfdc',
    icon: 'Landmark',
    nameKey: 'socialScheme.nhfdc.name',
    descKey: 'socialScheme.nhfdc.desc',
    ministryNoteKey: null,
    categories: ['disability'],
  },
  {
    id: 'dwbdnc_seed',
    icon: 'Landmark',
    nameKey: 'socialScheme.dwbdnc_seed.name',
    descKey: 'socialScheme.dwbdnc_seed.desc',
    ministryNoteKey: null,
    categories: ['dnt'],
  },
  {
    id: 'stand_up_india',
    icon: 'BadgeCheck',
    nameKey: 'socialScheme.stand_up_india.name',
    descKey: 'socialScheme.stand_up_india.desc',
    ministryNoteKey: null,
    categories: ['sc', 'st'],
    alsoForWomen: true,
  },
]

export function getMatchingSocialSchemes(categoryId: string | null | undefined, isWomanOwned: boolean): SocialScheme[] {
  if (!categoryId || categoryId === 'prefer_not_to_say' || categoryId === 'general') {
    return isWomanOwned ? SOCIAL_SCHEMES.filter((s) => s.alsoForWomen) : []
  }
  return SOCIAL_SCHEMES.filter(
    (s) => s.categories.includes(categoryId) || (isWomanOwned && s.alsoForWomen)
  )
}
