import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import AnimatedNumber from './AnimatedNumber'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

// Bands are on the 0-1 *fraction* of the [min, max] range, not the raw
// score — so a 300-850 credit score and a 0-100 feasibility score use
// exactly the same visual language (top ~20% reads teal, etc.) despite
// wildly different absolute numbers.
function colorForFraction(fraction) {
  if (fraction >= 0.8) return '#0f5c56'
  if (fraction >= 0.6) return '#1e3a5f'
  if (fraction >= 0.45) return '#d97706'
  return '#b3401f'
}

// min/max default to the original 0-100 feasibility-score range —
// existing Results.jsx/Compare.jsx callers are unaffected. Credit Score
// passes min={300} max={850}.
export default function RadialGauge({ score, verdict, min = 0, max = 100 }) {
  const { isSlow } = useConnectionQuality()
  const fraction = max > min ? Math.min(1, Math.max(0, (score - min) / (max - min))) : 0
  const color = colorForFraction(fraction)
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
          <PolarAngleAxis type="number" domain={[min, max]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: '#eef2f6' }} dataKey="value" cornerRadius={20} isAnimationActive={!isSlow} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold text-primary-900">
            <AnimatedNumber value={score} />
          </span>
          <span className="text-xs text-ink-900/40 -mt-1">/ {max}</span>
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
