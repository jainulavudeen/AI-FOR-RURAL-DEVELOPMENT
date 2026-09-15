import type { GroundedClaim, Locale, NarrationInput } from './types'

// Deterministic, no LLM — CLAUDE.md rule 4: a less-explained report is
// acceptable, a hanging or erroring one is not. These fire whenever the LLM
// is unreachable, too slow, or its output fails the numeric validator.

function formatRupees(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

const REPORT_TEMPLATES: Record<Locale, (input: NarrationInput) => string> = {
  en: (input) =>
    `Based on your inputs, you are matched to ${input.schemeName}. ` +
    `Your feasibility score is ${input.numbers.score ?? '—'}. ` +
    (input.numbers.loanAmount !== undefined
      ? `The suggested loan amount is ${formatRupees(input.numbers.loanAmount)} with a monthly EMI of ${
          input.numbers.emi !== undefined ? formatRupees(input.numbers.emi) : '—'
        }.`
      : ''),
  hi: (input) =>
    `आपके इनपुट के आधार पर, आप ${input.schemeName} के लिए पात्र हैं। ` +
    `आपका व्यवहार्यता स्कोर ${input.numbers.score ?? '—'} है। ` +
    (input.numbers.loanAmount !== undefined
      ? `सुझाई गई ऋण राशि ${formatRupees(input.numbers.loanAmount)} है, मासिक ईएमआई ${
          input.numbers.emi !== undefined ? formatRupees(input.numbers.emi) : '—'
        }।`
      : ''),
  ta: (input) =>
    `உங்கள் தகவல்களின் அடிப்படையில், நீங்கள் ${input.schemeName} திட்டத்திற்கு பொருந்துகிறீர்கள். ` +
    `உங்கள் சாத்தியக்கூறு மதிப்பெண் ${input.numbers.score ?? '—'}. ` +
    (input.numbers.loanAmount !== undefined
      ? `பரிந்துரைக்கப்பட்ட கடன் தொகை ${formatRupees(input.numbers.loanAmount)}, மாதாந்திர தவணை ${
          input.numbers.emi !== undefined ? formatRupees(input.numbers.emi) : '—'
        }.`
      : ''),
}

export function buildFallbackNarration(input: NarrationInput): string {
  return REPORT_TEMPLATES[input.locale](input)
}

const QUERY_FALLBACK: Record<Locale, string> = {
  en: 'This question needs a closer look. Please visit your nearest Common Service Centre or contact an officer for a detailed answer.',
  hi: 'इस प्रश्न के लिए विस्तृत जांच आवश्यक है। कृपया विस्तृत उत्तर के लिए अपने नज़दीकी कॉमन सर्विस सेंटर जाएं या किसी अधिकारी से संपर्क करें।',
  ta: 'இந்தக் கேள்விக்கு விரிவான பரிசோதனை தேவை. விரிவான பதிலுக்கு உங்கள் அருகிலுள்ள பொது சேவை மையத்தை அணுகவும் அல்லது ஒரு அதிகாரியை தொடர்பு கொள்ளவும்.',
}

// The citation-bearing claims are still returned separately alongside this
// text (see QueryResult.claims) — the fallback text itself never repeats a
// claim's own numbers, since it wasn't validated against them.
export function buildFallbackAnswer(locale: Locale, _claims: GroundedClaim[]): string {
  return QUERY_FALLBACK[locale]
}
