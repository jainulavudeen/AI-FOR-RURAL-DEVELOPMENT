import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { formatINR } from '../lib/format'
import StatTile from './StatTile'

// Compact 4-tile summary of the same @setu/core summarizeLedger() output
// Bahi-Khata itself renders in full — never a separate computation, so
// this can never quote a different net surplus than the full ledger page.
export default function CashFlowSnapshotCard({ summary }) {
  const { t } = useI18n()

  return (
    <div className="rounded-3xl border border-primary-100 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold text-primary-900">{t('dashboard.cashFlowCardTitle')}</p>
          <p className="text-[12px] text-ink-900/50">{t('dashboard.cashFlowCardSubtitle')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="TrendingUp" label={t('bahiKhata.statTotalSales')} value={formatINR(summary.totalSales)} />
        <StatTile icon="Wallet" label={t('bahiKhata.statNetSurplus')} value={formatINR(summary.netSurplus)} />
        <StatTile icon="HandCoins" label={t('bahiKhata.statPendingUdhaar')} value={formatINR(summary.pendingUdhaar)} />
        <StatTile icon="Smartphone" label="UPI" value={`${summary.digitalSharePercent.toFixed(0)}%`} />
      </div>
      <Link
        to="/bahi-khata"
        className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary-700 hover:text-primary-900"
      >
        {t('dashboard.openLedgerCta')}
        <ArrowRight size={13} />
      </Link>
    </div>
  )
}
