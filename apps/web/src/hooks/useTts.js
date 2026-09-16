import { useEffect, useState } from 'react'

const TTS_LANG = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Shared Web Speech API TTS wrapper — used by MicroLesson (per-lesson,
// ~60s) and ReportNarration (the whole report, in-language). Feature-
// detected; callers should hide their "Listen" affordance entirely when
// speechSupported() is false rather than show a dead button — text is
// always present regardless, per CLAUDE.md's target-device posture.
export function useTts(language) {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    return () => {
      if (speechSupported()) window.speechSynthesis.cancel()
    }
  }, [])

  const speak = (text) => {
    if (!speechSupported()) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = TTS_LANG[language] ?? TTS_LANG.en
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  const stop = () => {
    if (speechSupported()) window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return { speaking, speak, stop, supported: speechSupported() }
}
