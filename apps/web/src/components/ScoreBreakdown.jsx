import { motion } from 'framer-motion'
import { useI18n } from '../i18n/I18nContext'

const SOURCE_NOTE_KEYS = {
  live: 'results.demandSignalLive',
  cached: 'results.demandSignalCached',
}

export default function ScoreBreakdown({ factors }) {
  const { t } = useI18n()
  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.value)), 1)

  return (
    <div>
      <h3 className="mb-3 text-sm font-bold text-primary-900">{t('results.scoreBreakdownTitle')}</h3>
      <div className="space-y-2.5">
        {factors.map((f) => {
          const positive = f.value >= 0
          const widthPct = Math.min(100, (Math.abs(f.value) / maxAbs) * 100)
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
              {f.sourceNote && SOURCE_NOTE_KEYS[f.sourceNote] && (
                <p className="ml-[172px] mt-0.5 text-[10px] text-ink-900/40">{t(SOURCE_NOTE_KEYS[f.sourceNote])}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
