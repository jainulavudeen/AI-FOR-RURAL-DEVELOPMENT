import Icon from './Icon'

export default function StatTile({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white px-4 py-4 card-shadow">
      <div className="flex items-center gap-2 text-primary-500 mb-2">
        <Icon name={icon} size={15} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-900/40">{label}</span>
      </div>
      <p className="text-lg font-extrabold text-primary-900 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-ink-900/40 mt-0.5">{sub}</p>}
    </div>
  )
}
