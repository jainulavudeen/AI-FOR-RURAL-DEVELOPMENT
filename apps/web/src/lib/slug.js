// Turns a slug id ("madurai_north") into a display-ready guess
// ("Madurai North") — used only as a fallback when a real display name
// isn't already available (e.g. an old report saved before selection
// started carrying stateName/districtName/blockName alongside the ids —
// see AppDataContext.jsx and Wizard.jsx). Never authoritative: prefer the
// real name wherever one was actually captured.
export function humanizeSlug(slug) {
  if (!slug) return ''
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
