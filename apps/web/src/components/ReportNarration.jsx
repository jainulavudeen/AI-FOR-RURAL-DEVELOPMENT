import { Volume2, VolumeX } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useTts } from '../hooks/useTts'
import { buildReportNarration } from '../lib/reportNarration'

// Reads the whole report aloud, in-language — not just the numbers
// (MicroLesson's per-topic TTS is separate and narrower). Same
// feature-detected Web Speech API seam as MicroLesson, via the shared
// useTts hook; renders nothing if unsupported, same as VoiceInputButton
// degrading to nothing rather than a dead control.
export default function ReportNarration(props) {
  const { t, language } = useI18n()
  const { speaking, speak, supported } = useTts(language)

  if (!supported) return null

  const handleClick = () => speak(buildReportNarration(t, props))

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors"
    >
      {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
      {speaking ? t('narration.stop') : t('narration.listenToReport')}
    </button>
  )
}
