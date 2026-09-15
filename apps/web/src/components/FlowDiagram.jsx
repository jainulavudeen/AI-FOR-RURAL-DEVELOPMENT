import { motion } from 'framer-motion'
import { UserRound, Cpu, Layers, FileCheck2 } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

const STEPS = [
  { icon: UserRound, titleKey: 'landing.flowStep1Title', descKey: 'landing.flowStep1Desc' },
  { icon: Cpu, titleKey: 'landing.flowStep2Title', descKey: 'landing.flowStep2Desc' },
  { icon: Layers, titleKey: 'landing.flowStep3Title', descKey: 'landing.flowStep3Desc' },
  { icon: FileCheck2, titleKey: 'landing.flowStep4Title', descKey: 'landing.flowStep4Desc' },
]

export default function FlowDiagram() {
  const { t } = useI18n()

  return (
    <div className="relative">
      {/* connecting line — desktop */}
      <div className="hidden md:block absolute top-9 left-[12.5%] right-[12.5%] h-px">
        <svg width="100%" height="2" preserveAspectRatio="none" className="overflow-visible">
          <line
            x1="0" y1="1" x2="100%" y2="1"
            stroke="url(#flowGradient)"
            strokeWidth="2"
            strokeDasharray="1 10"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="flowGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#83a5c8" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#83a5c8" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          return (
            <motion.div
              key={step.titleKey}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.12 }}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white border border-primary-100 shadow-card">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-700 text-white">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white ring-4 ring-surface">
                  {idx + 1}
                </span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-primary-900">{t(step.titleKey)}</h3>
              <p className="mt-1.5 text-sm text-ink-900/60 max-w-[220px]">{t(step.descKey)}</p>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
