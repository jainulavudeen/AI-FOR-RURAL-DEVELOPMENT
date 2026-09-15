// The actual enforcement of CLAUDE.md rule 2 ("the model narrates and
// reviews, it never computes"): every numeric token in the model's output
// must trace back to a number we handed it. This is deliberately
// conservative — a false reject just falls back to the deterministic
// template (an accepted degradation per CLAUDE.md rule 4: "a
// less-explained report is acceptable"), whereas a false accept is exactly
// the bug this exists to prevent. Pure and synchronous, no I/O.

const EPSILON = 0.5 // absolute tolerance — covers rupee rounding in prose

// Matches ₹1,25,000 / 1,25,000 / 125000 / 6.5% / 6.5 percent / 3 (plain
// integers) — currency symbol, thousands separators (Indian or plain),
// decimals, and an optional trailing "%". Deliberately broad: over-matching
// (e.g. a stray "3" from "3 months") just means that number must also be in
// the allow-list, which it will be if the caller built `numbers` completely.
const NUMERIC_TOKEN_RE = /₹?\s?(\d[\d,]*(?:\.\d+)?)\s?%?/g

export function extractNumericTokens(text: string): number[] {
  const tokens: number[] = []
  for (const match of text.matchAll(NUMERIC_TOKEN_RE)) {
    const normalized = (match[1] ?? '').replace(/,/g, '')
    const value = Number(normalized)
    if (Number.isFinite(value)) tokens.push(value)
  }
  return tokens
}

export interface ValidationResult {
  valid: boolean
  invalid: number[]
}

export function validateNarration(text: string, allowedNumbers: number[]): ValidationResult {
  const found = extractNumericTokens(text)
  // extractNumericTokens never captures a leading minus sign (prose like
  // "-4" or "a factor of -6" loses the sign to the regex) — so an extracted
  // token is always >= 0, even when it came from a negative allowed number
  // (score factors legitimately range roughly -7..7). Compare against the
  // absolute value of each allowed number, not just the number itself, or
  // every narration mentioning a negative factor would be falsely rejected.
  const invalid = found.filter((token) => !allowedNumbers.some((allowed) => Math.abs(Math.abs(allowed) - token) <= EPSILON))
  return { valid: invalid.length === 0, invalid }
}

// Flattens a NarrationInput-shaped `numbers` + `factors` into the complete
// allow-list — every rupee figure, percentage, tenure, and factor value the
// calculator/feasibility assembly actually produced.
export function buildAllowedNumbers(numbers: Record<string, number>, factorValues: number[] = []): number[] {
  return [...Object.values(numbers), ...factorValues]
}
