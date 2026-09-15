import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

export default function OfflineBanner() {
  const { t } = useI18n()
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden bg-amber-500 text-white"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium">
            <WifiOff size={14} />
            {t('common.offlineBanner')}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
