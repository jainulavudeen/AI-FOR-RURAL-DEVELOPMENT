// Indian numbering system formatting (1,00,000 style), used across every screen
// regardless of active UI language — grouping stays Indian even when labels
// switch to Hindi/Tamil.
export function formatIndianNumber(value, { maximumFractionDigits = 0 } = {}) {
  const num = Number(value) || 0
  return num.toLocaleString('en-IN', { maximumFractionDigits })
}

export function formatINR(value, { maximumFractionDigits = 0, compact = false } = {}) {
  const num = Number(value) || 0
  if (compact) {
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`
    if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`
  }
  return `₹${formatIndianNumber(num, { maximumFractionDigits })}`
}

export function formatPercent(value, lang = 'en') {
  const num = Number(value) || 0
  return `${num.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
}
