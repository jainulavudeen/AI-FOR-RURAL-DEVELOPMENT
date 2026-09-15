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

export {
  BASE_SCORE,
  DEFAULT_BASE_SCORE,
  SCORE_MIN,
  SCORE_MAX,
  clampScore,
  classifyVerdict,
  type VerdictKey,
} from './feasibilityBaseline'
