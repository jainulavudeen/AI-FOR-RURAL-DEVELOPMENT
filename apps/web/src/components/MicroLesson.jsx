import { useEffect, useState } from 'react'
import { GraduationCap, Volume2, VolumeX } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

// Web Speech API TTS locale codes — same three languages the app already
// supports. Feature-detected below; a browser with no speechSynthesis (or
// no matching voice) just never shows the Listen button — the lesson text
// itself is always present regardless, per CLAUDE.md's target-device
// posture of a text fallback that never depends on an optional API.
const TTS_LANG = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// 60-second financial-literacy lessons (EMI / moratorium / margin),
// surfaced inline exactly where the relevant number appears — not a
// separate pamphlet. `highlight` auto-expands and visually emphasizes the
// lesson; callers set it when it's most relevant (e.g. the applicant's
// score is marginal/low, or the scheme they matched actually carries a
// moratorium) — see Results.jsx for the specific triggers chosen.
export default function MicroLesson({ topic, highlight = false }) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(highlight)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (highlight) setOpen(true)
  }, [highlight])

  useEffect(() => {
    // Stop any in-progress narration if the component unmounts or the
    // language changes mid-speech — never leave a dangling utterance.
    return () => {
      if (speechSupported()) window.speechSynthesis.cancel()
    }
  }, [])

  const title = t(`lessons.${topic}Title`)
  const body = t(`lessons.${topic}Body`)

  const handleListen = () => {
    if (!speechSupported()) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(body)
    utterance.lang = TTS_LANG[language] ?? TTS_LANG.en
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  return (
    <div
      className={`mt-4 rounded-2xl border p-4 transition-colors ${
        highlight ? 'border-amber-400/60 bg-amber-50/60' : 'border-primary-100 bg-primary-50/30'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
            <GraduationCap size={15} />
          </span>
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-wide text-amber-700">{t('lessons.sixtySecond')}</span>
            <span className="block text-sm font-semibold text-primary-900">{title}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-3 pl-10">
          <p className="text-[13px] leading-relaxed text-ink-900/70">{body}</p>
          {speechSupported() && (
            <button
              type="button"
              onClick={handleListen}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
            >
              {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
              {speaking ? t('lessons.stop') : t('lessons.listen')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
