import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Delete, ShoppingCart, TrendingDown, HandCoins, Undo2, Banknote, Smartphone } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { formatINR } from '../lib/format'
import { recordTransaction } from '../lib/ledger'

const TYPES = [
  { id: 'sale', icon: ShoppingCart, key: 'bahiKhata.modal.typeSale', activeClass: 'bg-teal-600 text-white border-teal-600' },
  { id: 'expense', icon: TrendingDown, key: 'bahiKhata.modal.typeExpense', activeClass: 'bg-red-500 text-white border-red-500' },
  { id: 'udhaar_given', icon: HandCoins, key: 'bahiKhata.modal.typeUdhaarGiven', activeClass: 'bg-amber-500 text-white border-amber-500' },
  { id: 'udhaar_repaid', icon: Undo2, key: 'bahiKhata.modal.typeUdhaarRepaid', activeClass: 'bg-primary-700 text-white border-primary-700' },
]

const QUICK_ADD_AMOUNTS = [50, 100, 200, 500, 1000, 2000]
const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', 'back'],
]
const MAX_DIGITS = 8 // caps entry at 99,999,999 — well past any plausible single transaction

// Bahi-Khata's entry point — a big-target numeric logger (CLAUDE.md's
// target user: a first-time smartphone user who may not read fluently, so
// this leans on icons/colour and a digit keypad over free-text typing).
// Offline-safe: lib/ledger.js's recordTransaction resolves to `queued:
// true` instead of throwing when there's no connectivity (see that file
// and vite.config.js's matching Workbox entry) — this component always
// treats that the same as a successful save.
export default function LogSaleModal({ open, onClose, onSaved }) {
  const { t } = useI18n()
  const [type, setType] = useState('sale')
  const [amountStr, setAmountStr] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [customerName, setCustomerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amount = Number(amountStr) || 0

  const reset = () => {
    setType('sale')
    setAmountStr('')
    setPaymentMode('cash')
    setCustomerName('')
    setSaving(false)
    setError('')
  }

  const close = () => {
    onClose()
    reset()
  }

  const pressDigit = (d) => {
    setAmountStr((prev) => {
      if (prev.replace(/^0+/, '').length >= MAX_DIGITS) return prev
      const next = prev === '0' ? d : prev + d
      return next.replace(/^0+(?=\d)/, '')
    })
  }

  const pressBackspace = () => setAmountStr((prev) => prev.slice(0, -1))

  const pressQuickAdd = (delta) => setAmountStr((prev) => String((Number(prev) || 0) + delta))

  const handleSave = async () => {
    if (amount <= 0) {
      setError(t('bahiKhata.modal.amountRequired'))
      return
    }
    setSaving(true)
    setError('')
    const result = await recordTransaction({
      type,
      amount,
      paymentMode,
      customerName: customerName.trim() || null,
      note: null,
    })
    setSaving(false)

    if (result.ok) {
      onSaved({
        queued: result.queued,
        record: result.data,
        submitted: { type, amount, paymentMode, customerName: customerName.trim() || null },
      })
      close()
    } else {
      setError(t('bahiKhata.modal.saveError'))
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 px-0 sm:px-4"
          onClick={close}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 card-shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label={t('bahiKhata.modal.cancel')}
              className="absolute right-4 top-4 text-ink-900/40 hover:text-ink-900"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-extrabold text-primary-900">{t('bahiKhata.modal.title')}</h2>
            <p className="mt-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-900/40">
              {t('bahiKhata.modal.subtitle')}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {TYPES.map((opt) => {
                const Icon = opt.icon
                const active = type === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setType(opt.id)}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-[12.5px] font-bold transition-colors ${
                      active ? opt.activeClass : 'border-primary-100 text-primary-800 hover:bg-primary-50'
                    }`}
                  >
                    <Icon size={15} />
                    {t(opt.key)}
                  </button>
                )
              })}
            </div>

            <div className="mt-5 rounded-2xl bg-primary-50/70 border border-primary-100 px-4 py-4 text-center">
              <p className="text-3xl font-extrabold text-primary-900 tabular-nums">{formatINR(amount)}</p>
            </div>

            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-900/40">{t('bahiKhata.modal.quickAdd')}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ADD_AMOUNTS.map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => pressQuickAdd(delta)}
                    className="rounded-lg bg-primary-100 px-2.5 py-1.5 text-[12px] font-bold text-primary-800 hover:bg-primary-200 transition-colors"
                  >
                    +{formatINR(delta)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {KEYPAD_ROWS.flat().map((key) =>
                key === 'back' ? (
                  <button
                    key={key}
                    type="button"
                    onClick={pressBackspace}
                    className="flex items-center justify-center rounded-xl bg-primary-50 py-3 text-primary-700 hover:bg-primary-100 transition-colors"
                    aria-label={t('bahiKhata.modal.cancel')}
                  >
                    <Delete size={17} />
                  </button>
                ) : (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pressDigit(key)}
                    className="rounded-xl bg-primary-50 py-3 text-base font-bold text-primary-900 hover:bg-primary-100 transition-colors"
                  >
                    {key}
                  </button>
                )
              )}
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-900/40">{t('bahiKhata.modal.paymentModeLabel')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-[12.5px] font-bold transition-colors ${
                    paymentMode === 'cash' ? 'border-primary-700 bg-primary-700 text-white' : 'border-primary-100 text-primary-800'
                  }`}
                >
                  <Banknote size={15} />
                  {t('ledger.paymentMode.cash')}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('upi')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-[12.5px] font-bold transition-colors ${
                    paymentMode === 'upi' ? 'border-primary-700 bg-primary-700 text-white' : 'border-primary-100 text-primary-800'
                  }`}
                >
                  <Smartphone size={15} />
                  {t('ledger.paymentMode.upi')}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-900/40">
                {t('bahiKhata.modal.customerLabel')}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('bahiKhata.modal.customerPlaceholder')}
                className="w-full rounded-xl border border-primary-200 px-3 py-2.5 text-sm text-ink-900 focus:border-primary-500 focus:outline-none"
              />
            </div>

            {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-5 w-full rounded-full bg-amber-500 px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? t('bahiKhata.modal.saving') : t('bahiKhata.modal.save')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
