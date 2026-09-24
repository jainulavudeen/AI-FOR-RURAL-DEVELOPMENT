import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

// Every value assembleFeasibilityScore's `source.label` can carry (see
// apps/api's feasibility/types.ts) — 'baseline' has no note of its own,
// rendered as plain text via source.label directly for anything not
// listed here (e.g. a raw 'live'/'cached' passed straight through).
const SOURCE_NOTE_KEYS = {
  live: 'results.demandSignalLive',
  cached: 'results.demandSignalCached',
  'real (block-level)': 'results.sourceRealBlock',
  'real (district-level)': 'results.sourceRealDistrict',
}

export default function ScoreBreakdown({ factors, excludedFactors = [] }) {
  const { t } = useI18n()
  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.value)), 1)

  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-primary-900">{t('results.scoreBreakdownTitle')}</h3>
      <div className="space-y-2.5">
        {factors.map((f) => {
          const positive = f.value >= 0
          const widthPct = Math.min(100, (Math.abs(f.value) / maxAbs) * 100)
          const sourceLabel = f.source?.label
          return (
            <div key={f.labelKey}>
              <div className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[12px] text-ink-900/60">{t(f.labelKey)}</span>
                <div className="flex-1 h-2 rounded-full bg-primary-50 overflow-hidden flex items-center">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${
                      f.isBaseline ? 'bg-primary-400' : positive ? 'bg-teal-500' : 'bg-red-400'
                    }`}
                  />
                </div>
                <span
                  className={`w-10 shrink-0 text-right text-[12px] font-bold ${
                    f.isBaseline ? 'text-primary-700' : positive ? 'text-teal-700' : 'text-red-600'
                  }`}
                >
                  {f.isBaseline ? f.value : `${positive ? '+' : ''}${f.value}`}
                </span>
              </div>
              {sourceLabel && sourceLabel !== 'baseline' && (
                <p className="ml-[172px] mt-0.5 text-[10px] text-ink-900/40">
                  {SOURCE_NOTE_KEYS[sourceLabel] ? t(SOURCE_NOTE_KEYS[sourceLabel]) : sourceLabel}
                  {f.source?.asOf ? ` · ${f.source.asOf}` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {excludedFactors.length > 0 && (
        <div className="mt-4 rounded-xl bg-ink-900/[0.03] px-3.5 py-3 space-y-1.5">
          {excludedFactors.map((ex) => (
            <p key={ex.labelKey} className="flex items-start gap-1.5 text-[11px] text-ink-900/45 leading-snug">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">{t(ex.labelKey)}:</span> {t(ex.reasonKey)}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
