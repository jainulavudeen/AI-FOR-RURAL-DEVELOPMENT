import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, ChevronDown, WifiOff, FileText } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { askAdvisorSaathi } from '../lib/advisorSaathi'
import { formatINR } from '../lib/format'

const SUGGESTION_KEYS = ['advisorSaathi.suggestion1', 'advisorSaathi.suggestion2', 'advisorSaathi.suggestion3']

// Advisor Saathi's chat UI. Every assistant message is exactly what
// apps/api's advisorSaathi module returned — this component never
// computes or edits a number itself, only renders what the server already
// validated (CLAUDE.md boundary rule 2). The "Inspect Data Fed to AI"
// panel renders the same claims+numbers the LLM prompt was built from,
// satisfying rule 3 (source + data-vintage per claim) with no extra
// bookkeeping on this side.
export default function AdvisorSaathi() {
  const { t, language } = useI18n()
  const { isAuthenticated, requestLogin } = useAuth()
  const { selection } = useAppData()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const send = async (question) => {
    const trimmed = question.trim()
    if (!trimmed || asking) return

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setInput('')
    setAsking(true)

    const result = await askAdvisorSaathi({ question: trimmed, selection, locale: language })
    setAsking(false)

    if (!result.ok || !result.data) {
      setMessages((prev) => [...prev, { role: 'assistant', unavailable: true }])
      return
    }

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: result.data.answer,
        narrationSource: result.data.narrationSource,
        tier: result.data.tier,
        claims: result.data.claims ?? [],
        numbers: result.data.numbers ?? {},
      },
    ])
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-700 text-white mb-4">
          <Sparkles size={22} />
        </span>
        <h1 className="text-2xl font-extrabold text-primary-900">{t('advisorSaathi.title')}</h1>
        <div className="mt-8 rounded-3xl border border-primary-100 card-shadow-lg bg-white px-8 py-14">
          <p className="text-sm text-ink-900/60">{t('advisorSaathi.signInPrompt')}</p>
          <button
            type="button"
            onClick={requestLogin}
            className="mt-5 inline-flex items-center rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-400 transition-colors"
          >
            {t('advisorSaathi.signInCta')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-8 py-10 sm:py-14 flex flex-col">
      <div className="text-center mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600/10 px-3 py-1 text-[11px] font-bold text-teal-700 mb-3">
          <Sparkles size={12} />
          {t('advisorSaathi.groundedBadge')}
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-900">{t('advisorSaathi.title')}</h1>
        <p className="mt-2 text-sm text-ink-900/60 max-w-xl mx-auto">{t('advisorSaathi.subtitle')}</p>
      </div>

      <div className="rounded-3xl border border-primary-100 bg-white p-4 sm:p-6 flex-1 min-h-[360px] flex flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto max-h-[50vh] pr-1">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 justify-center py-6">
              {SUGGESTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => send(t(key))}
                  className="rounded-full border border-primary-200 bg-primary-50/60 px-3.5 py-2 text-[12.5px] font-semibold text-primary-800 hover:bg-primary-100 transition-colors"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, idx) =>
            m.role === 'user' ? (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary-700 text-white px-4 py-2.5 text-[13px]">{m.text}</div>
              </div>
            ) : (
              <AssistantMessage key={idx} message={m} t={t} />
            )
          )}

          {asking && (
            <div className="flex items-center gap-2 text-[12.5px] text-ink-900/45">
              <Sparkles size={13} className="animate-pulse" />
              {t('advisorSaathi.asking')}
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="mt-4 flex items-center gap-2 pt-4 border-t border-primary-50"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('advisorSaathi.inputPlaceholder')}
            className="flex-1 rounded-full border border-primary-200 px-4 py-2.5 text-[13px] text-ink-900 focus:border-primary-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={asking || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
            aria-label={t('advisorSaathi.askCta')}
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      <p className="mt-3 text-center text-[10.5px] text-ink-900/35">{t('advisorSaathi.poweredBy')}</p>
    </div>
  )
}

function AssistantMessage({ message, t }) {
  const [inspectOpen, setInspectOpen] = useState(false)

  if (message.unavailable) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-amber-50 border border-amber-200 px-4 py-2.5 text-[12.5px] text-amber-800 flex items-center gap-2">
          <WifiOff size={13} className="shrink-0" />
          {t('advisorSaathi.unavailable')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tl-sm bg-primary-50 px-4 py-2.5 text-[13px] text-ink-900 leading-relaxed">{message.text}</div>
        {message.narrationSource === 'template' && (
          <p className="mt-1 text-[10.5px] text-amber-700">{t('advisorSaathi.templateNotice')}</p>
        )}
        {message.claims?.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setInspectOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-800"
            >
              <FileText size={11} />
              {inspectOpen ? t('advisorSaathi.hideDataCta') : t('advisorSaathi.inspectDataCta')}
              <ChevronDown size={11} className={`transition-transform ${inspectOpen ? 'rotate-180' : ''}`} />
            </button>
            {inspectOpen && (
              <div className="mt-2 rounded-xl border border-primary-100 bg-white p-3 space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-900/40 mb-1">{t('advisorSaathi.claimSectionTitle')}</p>
                  <ul className="space-y-1">
                    {message.claims.map((c, i) => (
                      <li key={i} className="text-[11px] text-ink-900/65 leading-snug">
                        <span className="font-semibold">[{c.sourceId}]</span> {c.text}{' '}
                        <span className="text-ink-900/35">({c.dataVintage})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-900/40 mb-1">{t('advisorSaathi.numbersSectionTitle')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(message.numbers).map(([key, value]) => (
                      <span key={key} className="rounded bg-primary-50 px-2 py-0.5 text-[10.5px] text-primary-800">
                        {key}: {typeof value === 'number' && Math.abs(value) > 100 ? formatINR(value) : value}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
