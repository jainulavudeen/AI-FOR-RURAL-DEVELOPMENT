import { motion } from 'framer-motion'
import { UserRound, Database, Cpu, Gauge, Calculator, FileCheck2, ArrowDown, GitBranch, ShieldCheck, History, CheckCircle2, MapPinned, ScrollText, Sprout, Handshake, Wallet, Landmark, CheckCircle, Circle } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

function PipelineNode({ icon: IconCmp, title, desc, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      className="flex items-start gap-5"
    >
      <div className="flex flex-col items-center shrink-0">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-md shadow-primary-900/20">
          <IconCmp size={20} />
        </span>
      </div>
      <div className="pt-1.5 pb-8">
        <h3 className="text-[15px] font-bold text-primary-900">{title}</h3>
        <p className="mt-1.5 text-sm text-ink-900/60 leading-relaxed max-w-md">{desc}</p>
      </div>
    </motion.div>
  )
}

function Connector() {
  return (
    <div className="flex pl-[22px]">
      <div className="w-[2px] h-8 bg-gradient-to-b from-primary-300 to-primary-100" />
    </div>
  )
}

export default function Architecture() {
  const { t } = useI18n()

  const moduleCards = [
    { icon: Gauge, titleKey: 'architecture.stepModule1Title', descKey: 'architecture.stepModule1Desc' },
    { icon: Calculator, titleKey: 'architecture.stepModule2Title', descKey: 'architecture.stepModule2Desc' },
  ]

  const validationStats = [
    { icon: History, value: '4.8%', key: 'architecture.validationStat1' },
    { icon: Database, value: '35+', key: 'architecture.validationStat2' },
    { icon: CheckCircle2, value: '312', key: 'architecture.validationStat3' },
  ]

  const dataRows = [
    { icon: MapPinned, rowKey: 'architecture.dataRowDigipin', vintage: 'static' },
    { icon: ScrollText, rowKey: 'architecture.dataRowCensus', vintage: 'static' },
    { icon: Sprout, rowKey: 'architecture.dataRowAntyodaya', vintage: 'periodic' },
    { icon: Handshake, rowKey: 'architecture.dataRowNrlm', vintage: 'periodic' },
    { icon: Wallet, rowKey: 'architecture.dataRowAgmarknet', vintage: 'live' },
    { icon: Landmark, rowKey: 'architecture.dataRowAccountAggregator', vintage: 'live' },
  ]

  const vintageStyles = {
    live: 'bg-teal-600/10 text-teal-700',
    periodic: 'bg-amber-100 text-amber-700',
    static: 'bg-primary-100 text-primary-700',
  }
  const vintageKeys = { live: 'architecture.dataVintageLive', periodic: 'architecture.dataVintagePeriodic', static: 'architecture.dataVintageStatic' }

  const roadmapBuilt = ['architecture.roadmapItemOffline', 'architecture.roadmapItemVoice', 'architecture.roadmapItemCategoryRouting']
  const roadmapNext = ['architecture.roadmapItemJanSamarth', 'architecture.roadmapItemWhatsapp', 'architecture.roadmapItemAA']

  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8 py-14 sm:py-20">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="text-3xl font-extrabold text-primary-900">{t('architecture.title')}</h1>
        <p className="mt-3 text-ink-900/60">{t('architecture.subtitle')}</p>
      </div>

      <div className="rounded-3xl border border-primary-100 bg-white card-shadow-lg p-6 sm:p-10">
        <div className="flex items-center gap-2 mb-8">
          <GitBranch size={16} className="text-amber-600" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-primary-700">{t('architecture.pipelineTitle')}</h2>
        </div>

        <PipelineNode index={0} icon={UserRound} title={t('architecture.stepInputTitle')} desc={t('architecture.stepInputDesc')} />
        <Connector />
        <PipelineNode index={1} icon={Database} title={t('architecture.stepRagTitle')} desc={t('architecture.stepRagDesc')} />
        <Connector />
        <PipelineNode index={2} icon={Cpu} title={t('architecture.stepAiTitle')} desc={t('architecture.stepAiDesc')} />

        {/* Branch */}
        <Connector />
        <div className="flex items-center gap-2 pl-[60px] mb-4 -mt-4">
          <GitBranch size={13} className="text-primary-300" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-900/35">
            {t('architecture.parallelLabel')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {moduleCards.map((m, i) => {
            const Icon = m.icon
            return (
              <motion.div
                key={m.titleKey}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="rounded-2xl border-2 border-primary-100 bg-primary-50/40 p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-700 text-white mb-3">
                  <Icon size={18} />
                </span>
                <h3 className="text-sm font-bold text-primary-900">{t(m.titleKey)}</h3>
                <p className="mt-1.5 text-[13px] text-ink-900/60 leading-relaxed">{t(m.descKey)}</p>
              </motion.div>
            )
          })}
        </div>

        <div className="flex justify-center mb-8">
          <ArrowDown size={20} className="text-primary-300" />
        </div>

        <PipelineNode
          index={4}
          icon={FileCheck2}
          title={t('architecture.stepOutputTitle')}
          desc={t('architecture.stepOutputDesc')}
        />
      </div>

      {/* Validation footer */}
      <div className="mt-8 rounded-3xl border border-teal-600/20 bg-teal-600/5 p-6 sm:p-10">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white">
            <ShieldCheck size={18} />
          </span>
          <h2 className="text-base font-bold text-primary-900">{t('architecture.validationTitle')}</h2>
        </div>
        <p className="text-sm text-ink-900/65 leading-relaxed max-w-2xl">{t('architecture.validationBody')}</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {validationStats.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.key} className="rounded-2xl bg-white border border-primary-100 px-4 py-4">
                <div className="flex items-center gap-2 text-teal-700 mb-1.5">
                  <Icon size={14} />
                  <span className="text-2xl font-extrabold text-primary-900">{s.value}</span>
                </div>
                <p className="text-[11px] text-ink-900/45">{t(s.key)}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Data grounding honesty */}
      <div className="mt-8 rounded-3xl border border-primary-100 bg-white card-shadow-lg p-6 sm:p-10">
        <h2 className="text-base font-bold text-primary-900">{t('architecture.dataGroundingTitle')}</h2>
        <p className="mt-2 text-sm text-ink-900/60 leading-relaxed max-w-2xl">{t('architecture.dataGroundingBody')}</p>

        <div className="mt-6 divide-y divide-primary-50">
          {dataRows.map((row, i) => {
            const RowIcon = row.icon
            return (
              <motion.div
                key={row.rowKey}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="flex items-center gap-4 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <RowIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary-900">{t(`${row.rowKey}.name`)}</p>
                  <p className="text-[12px] text-ink-900/50 leading-snug">{t(`${row.rowKey}.note`)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${vintageStyles[row.vintage]}`}>
                  {t(vintageKeys[row.vintage])}
                </span>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Roadmap */}
      <div className="mt-8 rounded-3xl border border-primary-100 bg-white card-shadow-lg p-6 sm:p-10">
        <h2 className="text-base font-bold text-primary-900 mb-6">{t('architecture.roadmapTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-700">{t('architecture.roadmapBuilt')}</p>
            <ul className="space-y-2.5">
              {roadmapBuilt.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-[13px] text-ink-900/70 leading-snug">
                  <CheckCircle size={15} className="mt-0.5 shrink-0 text-teal-600" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-900/40">{t('architecture.roadmapNext')}</p>
            <ul className="space-y-2.5">
              {roadmapNext.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-[13px] text-ink-900/70 leading-snug">
                  <Circle size={15} className="mt-0.5 shrink-0 text-ink-900/25" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
