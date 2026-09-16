import { ExternalLink, ShoppingBag } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

// A nudge, not an integration: three official Indian digital-commerce
// initiatives, shown only once a business already looks viable (per
// CLAUDE.md's "never a network dependency the report needs" posture, this
// is plain static links, no API call). Extends value past the loan moment
// into "how do I actually sell" — a common post-disbursement failure
// point per the brief. e-NAM leads for dairy/poultry (agri-adjacent
// commodity trading); ONDC and GeM are relevant to every business type.
const MARKETPLACES = [
  { id: 'ondc', url: 'https://ondc.org', nameKey: 'marketplace.ondcName', descKey: 'marketplace.ondcDesc' },
  { id: 'enam', url: 'https://enam.gov.in', nameKey: 'marketplace.enamName', descKey: 'marketplace.enamDesc' },
  { id: 'gem', url: 'https://gem.gov.in', nameKey: 'marketplace.gemName', descKey: 'marketplace.gemDesc' },
]

export default function MarketplaceNudge() {
  const { t } = useI18n()

  return (
    <div className="mt-6 rounded-2xl border border-teal-600/20 bg-teal-600/5 p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShoppingBag size={16} className="text-teal-700" />
        <span className="text-sm font-bold text-primary-900">{t('marketplace.title')}</span>
      </div>
      <p className="text-[13px] text-ink-900/60 mb-3.5">{t('marketplace.subtitle')}</p>
      <div className="space-y-2.5">
        {MARKETPLACES.map((m) => (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 border border-primary-100 hover:border-primary-300 transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-primary-900">{t(m.nameKey)}</p>
              <p className="text-[11.5px] text-ink-900/50">{t(m.descKey)}</p>
            </div>
            <ExternalLink size={14} className="shrink-0 text-primary-400" />
          </a>
        ))}
      </div>
    </div>
  )
}
