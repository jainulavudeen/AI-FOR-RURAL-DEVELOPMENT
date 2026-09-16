import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { SCHEMES } from '@setu/core'
import { getPeerBenchmark, FALLBACK_PEER_BENCHMARK } from '../lib/marketData'

// Buckets the exact cohort count into a rounded-down multiple of the
// k-anonymity threshold (e.g. a real count of 7 displays as "5+", 12 as
// "10+") — the backend already refuses to return anything below the
// threshold at all (see apps/api's peerBenchmark.ts), this is a second,
// UI-level layer of caution so a small pilot's exact small numbers are
// never put in front of a user, even in aggregate.
function bucketCount(n, step = 5) {
  return Math.floor(n / step) * step
}

export default function PeerBenchmarkCard({ businessId, districtId, verdictKey }) {
  const { t } = useI18n()
  const [benchmark, setBenchmark] = useState(FALLBACK_PEER_BENCHMARK)

  useEffect(() => {
    let cancelled = false
    setBenchmark(FALLBACK_PEER_BENCHMARK)
    getPeerBenchmark(businessId, districtId, verdictKey).then((result) => {
      if (!cancelled) setBenchmark(result)
    })
    return () => {
      cancelled = true
    }
  }, [businessId, districtId, verdictKey])

  return (
    <div className="mt-6 rounded-2xl border border-primary-100 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <Users size={15} className="text-primary-600" />
        <span className="text-sm font-bold text-primary-900">{t('benchmark.title')}</span>
      </div>
      <p className="text-[12px] text-ink-900/50 mb-3">{t('benchmark.subtitle')}</p>

      {!benchmark.available && <p className="text-[13px] text-ink-900/60">{t('benchmark.notEnoughData')}</p>}

      {benchmark.available && (
        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-primary-800">
            {t('benchmark.cohortSize', { count: bucketCount(benchmark.cohortSize) })}
          </p>
          <p className="text-[13px] text-ink-900/70">{t('benchmark.medianScore', { score: benchmark.medianScore })}</p>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-900/40 mb-1.5">
              {t('benchmark.schemeDistributionTitle')}
            </p>
            <div className="flex flex-wrap gap-2">
              {benchmark.schemeDistribution.map((entry) => (
                <span
                  key={entry.schemeId}
                  className="rounded-full bg-primary-50 px-3 py-1 text-[12px] font-medium text-primary-800"
                >
                  {t(SCHEMES[entry.schemeId]?.nameKey ?? entry.schemeId)} · {entry.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-900/35">{t('benchmark.privacyNote')}</p>
    </div>
  )
}
