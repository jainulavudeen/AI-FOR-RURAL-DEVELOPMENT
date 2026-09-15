import { Landmark } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

export default function Footer() {
  const { t } = useI18n()
  return (
    <footer className="border-t border-primary-100 bg-primary-950 text-primary-100/80">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white">
                <Landmark size={16} />
              </span>
              <span className="text-base font-bold text-white">{t('nav.brandName')}</span>
            </div>
            <p className="text-sm leading-relaxed">{t('footer.tagline')}</p>
          </div>
          <div className="text-sm space-y-1.5 sm:text-right">
            <p className="font-medium text-white/90">{t('footer.problemStatement')}</p>
            <p>{t('footer.ministry')}</p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-white/10 text-xs text-primary-100/50">
          {t('footer.rights')}
        </div>
      </div>
    </footer>
  )
}
