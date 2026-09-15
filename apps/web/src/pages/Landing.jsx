import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Database, ShieldCheck, BadgeCheck, LineChart } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import FlowDiagram from '../components/FlowDiagram'

const TRUST_BADGES = [
  { icon: ShieldCheck, key: 'landing.trustBadge1' },
  { icon: Database, key: 'landing.trustBadge2' },
  { icon: BadgeCheck, key: 'landing.trustBadge3' },
  { icon: LineChart, key: 'landing.trustBadge4' },
]

const STATS = [
  { value: '35+', key: 'landing.statLabel1' },
  { value: '5', key: 'landing.statLabel2' },
  { value: '99.2%', key: 'landing.statLabel3' },
  { value: '<2 min', key: 'landing.statLabel4' },
]

export default function Landing() {
  const { t } = useI18n()

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary-950">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(232,147,15,0.25), transparent 40%), radial-gradient(circle at 85% 15%, rgba(76,124,176,0.35), transparent 45%), radial-gradient(circle at 50% 100%, rgba(26,143,133,0.25), transparent 50%)',
          }}
        />
        <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-primary-100/90"
          >
            {t('landing.heroEyebrow')}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.08]"
          >
            {t('landing.heroTitle')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg text-primary-100/75 max-w-2xl mx-auto leading-relaxed"
          >
            {t('landing.heroSubtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/eligibility"
              className="group inline-flex items-center gap-2 rounded-full bg-amber-500 px-7 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-amber-900/30 transition-transform hover:scale-[1.03] hover:bg-amber-400"
            >
              {t('landing.ctaPrimary')}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/architecture"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-[15px] font-semibold text-white/90 transition-colors hover:bg-white/10"
            >
              {t('landing.ctaSecondary')}
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-4"
          >
            {STATS.map((s) => (
              <div key={s.key} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5">
                <div className="text-2xl font-extrabold text-white">{s.value}</div>
                <div className="mt-1 text-xs text-primary-100/60">{t(s.key)}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Flow */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-primary-900">{t('landing.flowTitle')}</h2>
        </div>
        <FlowDiagram />
      </section>

      {/* Trust strip */}
      <section className="border-t border-primary-100 bg-primary-50/60">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14">
          <p className="text-center text-sm font-semibold text-primary-700/80 tracking-wide uppercase mb-8">
            {t('landing.trustTitle')}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TRUST_BADGES.map((b) => {
              const Icon = b.icon
              return (
                <div
                  key={b.key}
                  className="flex items-center gap-3 rounded-2xl bg-white px-4 py-4 border border-primary-100 card-shadow"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700">
                    <Icon size={18} />
                  </span>
                  <span className="text-sm font-medium text-primary-900 leading-snug">{t(b.key)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
