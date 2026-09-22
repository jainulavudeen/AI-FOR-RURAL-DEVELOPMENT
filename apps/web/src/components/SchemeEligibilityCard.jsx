import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, HelpCircle, ChevronDown, ExternalLink, ShieldAlert, FileText } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { formatINR } from '../lib/format'
import Icon from './Icon'

// One scheme card for the /schemes "Government Schemes & Loan Matcher"
// screen. Deliberately plain and card-shaped rather than a dense table —
// large touch target for the whole header (expand/collapse), one badge,
// short bulleted reasons, no jargon-heavy prose. See CLAUDE.md's target
// user: a first-time smartphone user on a small screen who may not read
// English fluently.
export default function SchemeEligibilityCard({ item, facts, reference, documents, matchScore, personalized, expanded, onToggle }) {
  const { t } = useI18n()
  const eligible = item.eligible
  // National schemes whose real eligibility gate isn't a project-cost band
  // Setu's wizard captures (SHG membership, street-vendor status, ...) — a
  // third, neutral state distinct from "matched"/"not matched" so the UI
  // never implies a rejection Setu can't actually verify.
  const unverified = item.kind === 'national' && item.needsManualCheck

  return (
    <div
      className={`rounded-2xl border-2 card-shadow bg-white overflow-hidden transition-colors ${
        personalized ? (unverified ? 'border-amber-400/50' : eligible ? 'border-teal-500/40' : 'border-primary-100') : 'border-primary-100'
      } ${personalized && !eligible && !unverified ? 'opacity-70' : ''}`}
    >
      <button type="button" onClick={onToggle} className="w-full flex items-start gap-3.5 px-5 py-4 text-left">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${
            !personalized || eligible || unverified ? 'bg-primary-700' : 'bg-ink-900/25'
          }`}
        >
          <Icon name={item.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-extrabold text-primary-900 leading-snug">{t(item.nameKey)}</p>
            {kindLabel(item, t) && (
              <span className="inline-flex items-center rounded-full bg-ink-900/5 px-2 py-0.5 text-[10px] font-semibold text-ink-900/40">
                {kindLabel(item, t)}
              </span>
            )}
            {personalized &&
              (unverified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                  <HelpCircle size={12} />
                  {t('eligibility.badgeCheck')}
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    eligible ? 'bg-teal-600/10 text-teal-700' : 'bg-ink-900/5 text-ink-900/40'
                  }`}
                >
                  {eligible ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {eligible && matchScore != null ? t('eligibility.matchScoreLabel', { score: matchScore }) : eligible ? t('eligibility.badgeMatch') : t('eligibility.badgeNoMatch')}
                </span>
              ))}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-900/55 leading-snug">{t(item.descKey)}</p>
          {facts?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {facts.map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-800"
                >
                  <Icon name={f.icon} size={11} />
                  {f.value}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronDown size={18} className={`shrink-0 mt-1 text-ink-900/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-primary-50 px-5 py-4 space-y-3">
          {item.ministryNoteKey && (
            <p className="text-[11.5px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t(item.ministryNoteKey)}</p>
          )}

          {personalized && item.reasons?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-900/40 mb-1.5">
                {unverified ? t('eligibility.checkManuallyTitle') : eligible ? t('eligibility.whyQualifyTitle') : t('eligibility.whyNotTitle')}
              </p>
              <ul className="space-y-1">
                {item.reasons.map((reason, idx) => (
                  <li key={idx} className="text-[12.5px] text-ink-900/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-primary-400 shrink-0" />
                    {t(reason.key, formatReasonParams(reason.params))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reference?.annualIncomeCeiling != null && (
            <p className="text-[12px] text-ink-900/60">
              {t('eligibility.incomeCeilingNote', { amount: formatINR(reference.annualIncomeCeiling) })}
            </p>
          )}

          {documents?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-900/40 mb-1.5">{t('eligibility.requiredDocumentsTitle')}</p>
              <ul className="space-y-1">
                {documents.map((docKey) => (
                  <li key={docKey} className="text-[12.5px] text-ink-900/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-primary-400 shrink-0" />
                    {t(docKey)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reference?.applyStepKeys?.length > 0 ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-900/40 mb-1">{t('eligibility.howToApplyTitle')}</p>
              <ol className="space-y-1">
                {reference.applyStepKeys.map((stepKey, idx) => (
                  <li key={stepKey} className="text-[12.5px] text-ink-900/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[9.5px] font-bold text-primary-700">
                      {idx + 1}
                    </span>
                    {t(stepKey)}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            reference?.howToApplyKey && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-900/40 mb-1">{t('eligibility.howToApplyTitle')}</p>
                <p className="text-[12.5px] text-ink-900/70 leading-snug">{t(reference.howToApplyKey)}</p>
              </div>
            )
          )}

          {reference?.sourceUrl && (
            <div className="pt-2 border-t border-primary-50 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <a
                href={reference.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-800"
              >
                {t('eligibility.officialSource')}
                <ExternalLink size={11} />
              </a>
              <span className="text-[10.5px] text-ink-900/35">{reference.vintageLabel}</span>
            </div>
          )}
          {reference?.sourceCaveat && (
            <p className="flex items-start gap-1.5 text-[10.5px] text-amber-700/90 leading-snug">
              <ShieldAlert size={12} className="shrink-0 mt-0.5" />
              {t(reference.sourceCaveat === 'mirror' ? 'eligibility.sourceCaveatMirror' : 'eligibility.sourceCaveatSecondary')}
            </p>
          )}
          {personalized && eligible && (
            <Link
              to={`/bank-dossier?schemeId=${encodeURIComponent(item.id)}`}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary-700 px-4 py-2 text-[12px] font-bold text-white hover:bg-primary-800 transition-colors"
            >
              <FileText size={13} />
              {t('eligibility.printDossierCta')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function kindLabel(item, t) {
  if (item.kind === 'state') return t('eligibility.kindState', { state: t(`state.${item.scheme.stateId}`) })
  if (item.kind === 'national') return t('eligibility.kindNational')
  return null
}

function formatReasonParams(params) {
  if (!params) return undefined
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === 'number' ? formatINR(v) : v
  }
  return out
}
