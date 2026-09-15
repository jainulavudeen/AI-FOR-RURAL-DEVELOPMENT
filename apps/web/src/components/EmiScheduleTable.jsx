import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { formatINR } from '../lib/format'

export default function EmiScheduleTable({ rows }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6 rounded-2xl border border-primary-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t('common.showLess') : t('common.showMore')}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 bg-primary-50/50 hover:bg-primary-50 transition-colors"
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-primary-900">{t('results.emiScheduleTitle')}</p>
          <p className="text-[11px] text-ink-900/45">{t('results.emiScheduleSubtitle')}</p>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown size={18} className="text-primary-600" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-t border-primary-100 bg-white text-left text-[10px] uppercase tracking-wide text-ink-900/40">
                    <th className="px-2.5 py-2.5 font-medium whitespace-nowrap">{t('results.tableMonth')}</th>
                    <th className="px-2.5 py-2.5 font-medium whitespace-nowrap">{t('results.tableOpening')}</th>
                    <th className="px-2.5 py-2.5 font-medium whitespace-nowrap">{t('results.tableInterest')}</th>
                    <th className="px-2.5 py-2.5 font-medium whitespace-nowrap">{t('results.tablePrincipal')}</th>
                    <th className="px-2.5 py-2.5 font-medium whitespace-nowrap">{t('results.tablePayment')}</th>
                    <th className="px-2.5 py-2.5 font-medium whitespace-nowrap">{t('results.tableClosing')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.month} className="border-t border-primary-50">
                      <td className="px-2.5 py-2.5 font-medium text-primary-900 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span>{r.month}</span>
                          {r.isMoratorium && (
                            <span className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 leading-none">
                              {t('results.moratoriumTag')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 text-ink-900/70 whitespace-nowrap">{formatINR(r.opening)}</td>
                      <td className="px-2.5 py-2.5 text-ink-900/70 whitespace-nowrap">{formatINR(r.interest)}</td>
                      <td className="px-2.5 py-2.5 text-ink-900/70 whitespace-nowrap">{formatINR(r.principal)}</td>
                      <td className="px-2.5 py-2.5 font-semibold text-primary-900 whitespace-nowrap">{formatINR(r.payment)}</td>
                      <td className="px-2.5 py-2.5 text-ink-900/70 whitespace-nowrap">{formatINR(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
