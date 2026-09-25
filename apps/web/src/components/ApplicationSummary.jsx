import { useI18n } from '../i18n/I18nContext'
import { BUSINESS_TYPES } from '../data/businesses'
import { humanizeSlug } from '../lib/slug'

// One line of "what is this application": business · block, district ·
// score/verdict. Reads the frozen saved report — every number here came
// from @setu/core when the report was generated, never recomputed.
export function applicationTitle(t, application) {
  const inputs = application.report?.inputs ?? {}
  const business = BUSINESS_TYPES.find((b) => b.id === inputs.businessId)
  return business ? t(business.labelKey) : humanizeSlug(inputs.businessId || '') || t('applications.untitled')
}

export function applicationPlace(application) {
  const inputs = application.report?.inputs ?? {}
  const block = application.location?.blockName || inputs.blockName || inputs.blockId
  const district = application.location?.districtName || inputs.districtName || inputs.districtId
  return [block, district].filter(Boolean).map((x) => humanizeSlug(x)).join(', ')
}

export default function ApplicationSummary({ application }) {
  const { t } = useI18n()
  const report = application.report
  return (
    <div className="min-w-0">
      <p className="truncate text-[14px] font-bold text-primary-900">{applicationTitle(t, application)}</p>
      <p className="truncate text-[12px] text-ink-900/55">
        {applicationPlace(application)}
        {report && (
          <>
            {' · '}
            {t('applications.scoreLine', { score: report.score, verdict: t(report.verdictKey) })}
          </>
        )}
      </p>
    </div>
  )
}
