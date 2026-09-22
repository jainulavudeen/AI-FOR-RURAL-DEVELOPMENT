export {
  structureFinance,
  computeEmi,
  buildEmiSchedule,
  type StructureFinanceResult,
  type EmiInput,
  type EmiResult,
  type EmiScheduleRow,
  type EmiScheduleResult,
} from './calculator'

export { SCHEMES, MARGIN_PERCENT, type SchemeRule } from './schemes'

export {
  SOCIAL_CATEGORIES,
  SOCIAL_SCHEMES,
  getMatchingSocialSchemes,
  type SocialCategory,
  type SocialScheme,
} from './socialSchemes'

export { STATE_SCHEMES, getMatchingStateSchemes, type StateScheme } from './stateSchemes'

export { NATIONAL_SCHEMES, type NationalScheme } from './nationalSchemes'

export {
  BASE_SCORE,
  DEFAULT_BASE_SCORE,
  SCORE_MIN,
  SCORE_MAX,
  clampScore,
  classifyVerdict,
  type VerdictKey,
} from './feasibilityBaseline'

export {
  getEligibleSchemes,
  type EligibilityInput,
  type EligibilityReason,
  type EligibleScheme,
  type EligibleGenericScheme,
  type EligibleSocialScheme,
  type EligibleStateScheme,
  type EligibleNationalScheme,
} from './eligibility'

export { SCHEME_REFERENCES, type SchemeReference } from './schemeReferenceInfo'

export { computeMatchScore } from './schemeMatchScore'

export { GENERIC_REQUIRED_DOCUMENTS, SCHEME_DOCUMENT_REQUIREMENTS, getRequiredDocuments } from './schemeDocumentRequirements'
