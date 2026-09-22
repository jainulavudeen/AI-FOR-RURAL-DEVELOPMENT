// Unifies SCHEMES (generic, cost-band routed) and SOCIAL_SCHEMES
// (category-routed corporations) into one ranked eligibility list, for the
// "which schemes can I actually apply to" screen (apps/web's /schemes).
//
// Deterministic, synchronous, no I/O — same boundary as calculator.ts (see
// CLAUDE.md). This does not reimplement matching logic: it composes
// structureFinance's cost-band comparison and getMatchingSocialSchemes
// exactly, so a scheme's eligibility here can never drift from what
// Results.jsx actually applies.
import { SCHEMES, type SchemeRule } from './schemes'
import { SOCIAL_SCHEMES, getMatchingSocialSchemes, type SocialScheme } from './socialSchemes'
import { STATE_SCHEMES, type StateScheme } from './stateSchemes'
import { NATIONAL_SCHEMES, type NationalScheme } from './nationalSchemes'

export interface EligibilityReason {
  key: string
  params?: Record<string, string | number>
}

export interface EligibleGenericScheme {
  kind: 'generic'
  id: string
  nameKey: string
  descKey: string
  icon: string
  eligible: boolean
  reasons: EligibilityReason[]
  scheme: SchemeRule
}

export interface EligibleSocialScheme {
  kind: 'social'
  id: string
  nameKey: string
  descKey: string
  ministryNoteKey: string | null
  icon: string
  eligible: boolean
  reasons: EligibilityReason[]
  scheme: SocialScheme
}

export interface EligibleStateScheme {
  kind: 'state'
  id: string
  nameKey: string
  descKey: string
  ministryNoteKey: string | null
  icon: string
  eligible: boolean
  reasons: EligibilityReason[]
  scheme: StateScheme
}

export interface EligibleNationalScheme {
  kind: 'national'
  id: string
  nameKey: string
  descKey: string
  ministryNoteKey: string | null
  icon: string
  eligible: boolean
  // True for a national scheme whose real eligibility gate isn't a
  // project-cost band Setu's wizard captures (SHG membership,
  // street-vendor status, ...) — `eligible` stays false so it never
  // inflates the "you qualify" count, but the UI shows a neutral "check
  // separately" state instead of implying rejection.
  needsManualCheck: boolean
  reasons: EligibilityReason[]
  scheme: NationalScheme
}

export type EligibleScheme = EligibleGenericScheme | EligibleSocialScheme | EligibleStateScheme | EligibleNationalScheme

export interface EligibilityInput {
  projectCost: number
  categoryId?: string | null
  isWomanOwned?: boolean
  stateId?: string | null
}

export function getEligibleSchemes(input: EligibilityInput): EligibleScheme[] {
  const projectCost = Math.max(0, Number(input.projectCost) || 0)
  const categoryId = input.categoryId || null
  const isWomanOwned = !!input.isWomanOwned
  const stateId = input.stateId || null

  const generic: EligibleGenericScheme[] = Object.values(SCHEMES).map((scheme) => {
    const inBand = projectCost >= scheme.projectCostMin && projectCost <= scheme.projectCostMax
    const params = { min: scheme.projectCostMin, max: scheme.projectCostMax }
    return {
      kind: 'generic',
      id: scheme.id,
      nameKey: scheme.nameKey,
      descKey: `scheme.${scheme.id}.desc`,
      icon: scheme.icon,
      eligible: inBand,
      reasons: [{ key: inBand ? 'eligibility.reason.costBandMatch' : 'eligibility.reason.costBandMismatch', params }],
      scheme,
    }
  })

  const matchedSocialIds = new Set(getMatchingSocialSchemes(categoryId, isWomanOwned).map((s) => s.id))

  const social: EligibleSocialScheme[] = SOCIAL_SCHEMES.map((scheme) => {
    const eligible = matchedSocialIds.has(scheme.id)
    const reasons: EligibilityReason[] = []
    if (eligible) {
      if (categoryId && scheme.categories.includes(categoryId)) {
        reasons.push({ key: 'eligibility.reason.categoryMatch' })
      }
      if (isWomanOwned && scheme.alsoForWomen) {
        reasons.push({ key: 'eligibility.reason.womanOwned' })
      }
    } else {
      reasons.push({ key: categoryId ? 'eligibility.reason.categoryMismatch' : 'eligibility.reason.categoryUnknown' })
    }
    return {
      kind: 'social',
      id: scheme.id,
      nameKey: scheme.nameKey,
      descKey: scheme.descKey,
      ministryNoteKey: scheme.ministryNoteKey,
      icon: scheme.icon,
      eligible,
      reasons,
      scheme,
    }
  })

  const state: EligibleStateScheme[] = STATE_SCHEMES.map((scheme) => {
    const stateOk = !!stateId && scheme.stateId === stateId
    const eligible = stateOk && (!scheme.womenOnly || isWomanOwned)
    const reasons: EligibilityReason[] = []
    if (eligible) {
      reasons.push({ key: 'eligibility.reason.stateMatch' })
      if (scheme.womenOnly) reasons.push({ key: 'eligibility.reason.womanOwned' })
    } else if (!stateOk) {
      reasons.push({ key: 'eligibility.reason.stateMismatch' })
    } else {
      reasons.push({ key: 'eligibility.reason.womenOnlyMismatch' })
    }
    return {
      kind: 'state',
      id: scheme.id,
      nameKey: scheme.nameKey,
      descKey: scheme.descKey,
      ministryNoteKey: scheme.ministryNoteKey,
      icon: scheme.icon,
      eligible,
      reasons,
      scheme,
    }
  })

  const national: EligibleNationalScheme[] = NATIONAL_SCHEMES.map((scheme) => {
    const hasCostGate = scheme.projectCostMin != null && scheme.projectCostMax != null
    if (hasCostGate) {
      const inBand = projectCost >= (scheme.projectCostMin as number) && projectCost <= (scheme.projectCostMax as number)
      return {
        kind: 'national',
        id: scheme.id,
        nameKey: scheme.nameKey,
        descKey: scheme.descKey,
        ministryNoteKey: scheme.ministryNoteKey,
        icon: scheme.icon,
        eligible: inBand,
        needsManualCheck: false,
        reasons: [
          {
            key: inBand ? 'eligibility.reason.costBandMatch' : 'eligibility.reason.costBandMismatch',
            params: { min: scheme.projectCostMin as number, max: scheme.projectCostMax as number },
          },
        ],
        scheme,
      }
    }
    return {
      kind: 'national',
      id: scheme.id,
      nameKey: scheme.nameKey,
      descKey: scheme.descKey,
      ministryNoteKey: scheme.ministryNoteKey,
      icon: scheme.icon,
      eligible: false,
      needsManualCheck: true,
      reasons: [{ key: 'eligibility.reason.checkManually' }],
      scheme,
    }
  })

  return [...generic, ...social, ...state, ...national]
}
