import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import AnimatedNumber from './AnimatedNumber'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

function colorForScore(score) {
  if (score >= 80) return '#0f5c56'
  if (score >= 60) return '#1e3a5f'
  if (score >= 45) return '#d97706'
  return '#b3401f'
}

export default function RadialGauge({ score, verdict }) {
  const { isSlow } = useConnectionQuality()
  const color = colorForScore(score)
  const data = [{ name: 'score', value: score, fill: color }]

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-52 w-52">
        <RadialBarChart
          width={208}
          height={208}
          cx="50%"
          cy="50%"
          innerRadius="76%"
          outerRadius="100%"
          barSize={14}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: '#eef2f6' }} dataKey="value" cornerRadius={20} isAnimationActive={!isSlow} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold text-primary-900">
            <AnimatedNumber value={score} />
          </span>
          <span className="text-xs text-ink-900/40 -mt-1">/ 100</span>
        </div>
      </div>
      <span
        className="mt-3 rounded-full px-4 py-1.5 text-sm font-semibold"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {verdict}
      </span>
    </div>
  )
}
