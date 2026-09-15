import { PieChart, Pie, Cell } from 'recharts'
import { formatINR } from '../lib/format'
import { useI18n } from '../i18n/I18nContext'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

const MARGIN_COLOR = '#d97706'
const LOAN_COLOR = '#1e3a5f'

export default function MarginLoanDonut({ marginAmount, loanAmount }) {
  const { t } = useI18n()
  const { isSlow } = useConnectionQuality()
  const total = marginAmount + loanAmount
  const marginPct = total > 0 ? Math.round((marginAmount / total) * 100) : 0
  const loanPct = 100 - marginPct

  const data = [
    { name: t('results.marginLabel'), value: marginAmount, color: MARGIN_COLOR },
    { name: t('results.loanLabel'), value: loanAmount, color: LOAN_COLOR },
  ]

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-52 w-52">
        <PieChart width={208} height={208}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={68}
            outerRadius={96}
            paddingAngle={3}
            cornerRadius={8}
            isAnimationActive={!isSlow}
            animationDuration={900}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} stroke="none" />
            ))}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-extrabold text-primary-900">{loanPct}%</span>
          <span className="text-[11px] text-ink-900/40">{t('results.loanLabel')}</span>
        </div>
      </div>

      <div className="mt-5 w-full space-y-2.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between rounded-xl bg-primary-50/60 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-sm font-medium text-primary-900">{d.name}</span>
            </div>
            <span className="text-sm font-bold text-primary-900">{formatINR(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
