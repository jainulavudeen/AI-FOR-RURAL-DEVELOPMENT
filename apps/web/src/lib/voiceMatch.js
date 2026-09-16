// Fuzzy-matches a spoken transcript against a fixed list of options (state/
// district names, business-type names) — extends voice input beyond the
// margin field's "read out the digits" case to selecting from a list,
// which is what most of the wizard actually is. No network, no LLM: plain
// string normalization + token overlap, entirely client-side and
// deterministic, consistent with everything else voice-related in this
// app being a thin wrapper over the browser's own Web Speech API.
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip Latin combining diacritics only — Devanagari/Tamil vowel signs live outside this range and are left intact
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
}

const MATCH_THRESHOLD = 0.5

// `options` is any array; `getLabel(option)` returns the display string to
// match against. Returns the best-scoring option at/above the threshold,
// or null if nothing spoken/nothing matched well enough — callers should
// treat null as "did not understand," never as an error, and leave the
// manual picker as the fallback (it's always rendered regardless).
export function matchSpokenOption(transcript, options, getLabel) {
  const spoken = normalize(transcript)
  if (!spoken) return null

  let best = null
  let bestScore = 0

  for (const option of options) {
    const label = normalize(getLabel(option))
    if (!label) continue

    let score
    if (spoken === label) {
      score = 1
    } else if (label.includes(spoken) || spoken.includes(label)) {
      score = 0.8
    } else {
      const spokenTokens = new Set(spoken.split(/\s+/).filter(Boolean))
      const labelTokens = label.split(/\s+/).filter(Boolean)
      const overlap = labelTokens.filter((tok) => spokenTokens.has(tok)).length
      score = labelTokens.length ? overlap / labelTokens.length : 0
    }

    if (score > bestScore) {
      bestScore = score
      best = option
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null
}
