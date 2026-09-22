import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Plus, ShoppingCart, TrendingDown, HandCoins, Undo2, CheckCircle2, WifiOff, ShieldCheck } from 'lucide-react'
import { summarizeLedger } from '@setu/core'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { getTransactions } from '../lib/ledger'
import { formatINR } from '../lib/format'
import StatTile from '../components/StatTile'
import LogSaleModal from '../components/LogSaleModal'
import BankStatementUpload from '../components/BankStatementUpload'

const FILTER_TABS = [
  { id: 'all', key: 'bahiKhata.tabAll' },
  { id: 'sale', key: 'bahiKhata.tabSales' },
  { id: 'expense', key: 'bahiKhata.tabExpenses' },
  { id: 'udhaar_given', key: 'bahiKhata.tabUdhaarGiven' },
  { id: 'udhaar_repaid', key: 'bahiKhata.tabUdhaarRepaid' },
]

const TYPE_META = {
  sale: { icon: ShoppingCart, className: 'text-teal-700 bg-teal-600/10' },
  expense: { icon: TrendingDown, className: 'text-red-600 bg-red-100' },
  udhaar_given: { icon: HandCoins, className: 'text-amber-700 bg-amber-100' },
  udhaar_repaid: { icon: Undo2, className: 'text-primary-700 bg-primary-100' },
}

const MONTH_LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

function monthLabel(monthKey, language) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return new Intl.DateTimeFormat(MONTH_LOCALE[language] || 'en-IN', { month: 'short', year: 'numeric' }).format(date)
}

function dayLabel(isoString, language) {
  return new Intl.DateTimeFormat(MONTH_LOCALE[language] || 'en-IN', { day: 'numeric', month: 'short' }).format(new Date(isoString))
}

// Bahi-Khata — the daily-use ledger every other V2 screen (Credit Score,
// Dashboard, Bank Dossier) reads its cash-flow figures from. Auth-gated
// (this is squarely a "saving" action, CLAUDE.md's boundary) but every
// number on this page, once loaded once, keeps rendering fully offline:
// reads are Workbox StaleWhileRevalidate-cached (vite.config.js) and
// `summarizeLedger` (the same pure @setu/core function apps/api calls
// server-side) recomputes the totals/trend client-side with zero network
// dependency.
export default function BahiKhata() {
  const { t, language } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const [transactions, setTransactions] = useState(null) // null = still loading
  const [loadFailed, setLoadFailed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState('all')
  const [toast, setToast] = useState(null) // 'saved' | 'queued' | null

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    getTransactions().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setTransactions(result.data)
        setLoadFailed(false)
      } else {
        setTransactions((prev) => prev ?? [])
        setLoadFailed(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // A bank-statement upload's response is only a summary (count + warnings),
  // not the inserted rows — unlike LogSaleModal's onSaved, which gets the
  // real row back from the POST response and can prepend it optimistically,
  // this refetches the full list so the newly bank-verified transactions
  // actually appear.
  const handleStatementUploaded = () => {
    // No toast here — BankStatementUpload already shows its own detailed
    // inline result (count extracted, any warnings); a second generic
    // "Saved" toast on top of that would be redundant.
    getTransactions().then((result) => {
      if (result.ok) {
        setTransactions(result.data)
        setLoadFailed(false)
      }
    })
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const summary = useMemo(() => summarizeLedger(transactions ?? [], new Date()), [transactions])

  const handleSaved = ({ queued, record, submitted }) => {
    const entry = queued
      ? {
          id: `local-${Date.now()}`,
          ...submitted,
          note: null,
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          pending: true,
        }
      : record
    setTransactions((prev) => [entry, ...(prev ?? [])])
    setToast(queued ? 'queued' : 'saved')
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <BookOpen size={22} />
        </span>
        <h1 className="text-2xl font-extrabold text-primary-900">{t('bahiKhata.title')}</h1>
        <div className="mt-8 rounded-3xl border border-primary-100 card-shadow-lg bg-white px-8 py-14">
          <p className="text-sm text-ink-900/60">{t('bahiKhata.signInPrompt')}</p>
          <button
            type="button"
            onClick={requestLogin}
            className="mt-5 inline-flex items-center rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-400 transition-colors"
          >
            {t('bahiKhata.signInCta')}
          </button>
        </div>
      </div>
    )
  }

  const pendingUdhaarWatch = summary.totalSales > 0 && summary.pendingUdhaar > summary.totalSales * 0.25
  const visibleTransactions = tab === 'all' ? (transactions ?? []) : (transactions ?? []).filter((txn) => txn.type === tab)

  return (
    <div className="mx-auto max-w-5xl px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-700 text-white">
            <BookOpen size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-primary-900">{t('bahiKhata.title')}</h1>
            <p className="text-sm text-ink-900/55">{t('bahiKhata.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-amber-400 transition-colors"
        >
          <Plus size={16} />
          {t('bahiKhata.recordTransaction')}
        </button>
      </div>

      {loadFailed && (
        <p className="mb-6 flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12px] text-amber-800">
          <WifiOff size={13} />
          {t('bahiKhata.loadError')}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon="TrendingUp" label={t('bahiKhata.statTotalSales')} value={formatINR(summary.totalSales)} />
        <StatTile icon="TrendingDown" label={t('bahiKhata.statTotalExpenses')} value={formatINR(summary.totalExpenses)} />
        <StatTile
          icon="Wallet"
          label={t('bahiKhata.statNetSurplus')}
          value={formatINR(summary.netSurplus)}
          sub={t('bahiKhata.statNetSurplusSub', { percent: summary.netMarginPercent.toFixed(1) })}
        />
        <StatTile
          icon="HandCoins"
          label={t('bahiKhata.statPendingUdhaar')}
          value={formatINR(summary.pendingUdhaar)}
          sub={pendingUdhaarWatch ? t('bahiKhata.statPendingUdhaarWatch') : t('bahiKhata.statPendingUdhaarSafe')}
        />
      </div>

      <div className="mt-6">
        <BankStatementUpload onUploaded={handleStatementUploaded} />
      </div>

      <h2 className="mt-10 mb-3 text-sm font-bold text-primary-900">{t('bahiKhata.trendTitle')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {summary.monthBuckets.map((bucket) => {
          const total = bucket.sales + bucket.expenses
          const surplusShare = total > 0 ? Math.max(0, Math.min(100, (bucket.netSurplus / bucket.sales || 0) * 100)) : 0
          return (
            <div key={bucket.monthKey} className="rounded-2xl border border-primary-100 bg-white p-4 card-shadow">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-extrabold text-primary-900">{monthLabel(bucket.monthKey, language)}</p>
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                  {t(bucket.seasonLabelKey)}
                </span>
              </div>
              {bucket.sales === 0 && bucket.expenses === 0 ? (
                <p className="mt-3 text-[11.5px] text-ink-900/40">{t('bahiKhata.emptyMonth')}</p>
              ) : (
                <>
                  <p className="mt-3 text-lg font-extrabold text-primary-900">{formatINR(bucket.netSurplus)}</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-primary-50 overflow-hidden">
                    <div className="h-full bg-teal-600" style={{ width: `${surplusShare}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[10.5px] text-ink-900/45">
                    <span>{formatINR(bucket.sales)}</span>
                    <span>-{formatINR(bucket.expenses)}</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="mt-10 mb-3 text-sm font-bold text-primary-900">{t('bahiKhata.transactionsTitle')}</h2>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_TABS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTab(f.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
              tab === f.id ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
            }`}
          >
            {f.id === 'all' ? t(f.key, { count: (transactions ?? []).length }) : t(f.key)}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {visibleTransactions.length === 0 ? (
          <p className="rounded-2xl border border-primary-100 bg-white px-5 py-10 text-center text-[13px] text-ink-900/50">
            {t('bahiKhata.emptyTransactions')}
          </p>
        ) : (
          visibleTransactions.map((txn) => {
            const meta = TYPE_META[txn.type] ?? TYPE_META.sale
            const Icon = meta.icon
            const sign = txn.type === 'sale' || txn.type === 'udhaar_repaid' ? '+' : '-'
            return (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-4 py-3"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.className}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-bold text-primary-900">{t(`ledger.type.${txn.type}`)}</p>
                    <span className="rounded bg-ink-900/5 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-ink-900/40">
                      {t(`ledger.paymentMode.${txn.paymentMode}`)}
                    </span>
                    {txn.pending && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700">
                        {t('bahiKhata.pendingBadge')}
                      </span>
                    )}
                    {txn.source === 'bank_statement' && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-teal-600/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-700">
                        <ShieldCheck size={9} />
                        {t('bahiKhata.bankVerifiedBadge')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-900/45 truncate">
                    {txn.customerName ? `${txn.customerName} · ` : ''}
                    {dayLabel(txn.occurredAt, language)}
                  </p>
                </div>
                <p className={`text-sm font-extrabold shrink-0 ${sign === '+' ? 'text-teal-700' : 'text-red-600'}`}>
                  {sign}
                  {formatINR(txn.amount)}
                </p>
              </motion.div>
            )
          })
        )}
      </div>

      <LogSaleModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} />

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary-900 px-5 py-2.5 text-[12.5px] font-semibold text-white shadow-lg flex items-center gap-2"
        >
          <CheckCircle2 size={14} />
          {toast === 'queued' ? t('bahiKhata.queuedNotice') : t('bahiKhata.savedNotice')}
        </motion.div>
      )}
    </div>
  )
}
