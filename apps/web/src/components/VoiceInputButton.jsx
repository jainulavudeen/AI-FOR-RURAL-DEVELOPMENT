import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '../i18n/I18nContext'

const LANG_MAP = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }

// Thin wrapper around the browser's native SpeechRecognition API — genuinely
// functional, no backend involved. Renders nothing if the browser doesn't
// support it, so it degrades gracefully instead of showing a dead button.
export default function VoiceInputButton({ onResult, className = '' }) {
  const { t, language } = useI18n()
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(Boolean(SpeechRecognition))
  }, [])

  const handleClick = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = LANG_MAP[language] || 'en-IN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      onResult(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t('common.voiceInputAria')}
      title={listening ? t('common.listening') : t('common.voiceInputAria')}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
        listening ? 'bg-red-500 text-white' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
      } ${className}`}
    >
      {listening && (
        <motion.span
          className="absolute inset-0 rounded-full bg-red-500/40"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  )
}
