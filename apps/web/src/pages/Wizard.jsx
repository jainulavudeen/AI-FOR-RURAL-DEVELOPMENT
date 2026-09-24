import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, MapPin, IndianRupee, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { useAppData } from '../context/AppDataContext'
import { getStates, getDistricts, getBlocks } from '../lib/geography'
import { BUSINESS_TYPES } from '../data/businesses'
import { getBusinessTypes } from '../lib/businessTypes'
import { SOCIAL_CATEGORIES } from '@setu/core'
import { formatIndianNumber } from '../lib/format'
import { matchSpokenOption } from '../lib/voiceMatch'
import ProgressBar from '../components/ProgressBar'
import Icon from '../components/Icon'
import VoiceInputButton from '../components/VoiceInputButton'
import LocationDigipin from '../components/LocationDigipin'

const MIN_MARGIN = 5000
const MAX_MARGIN = 500000
const STEP_MARGIN = 1000

const variants = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
}

export default function Wizard() {
  const { t } = useI18n()
  const { selection, updateSelection, setHasReport, compareBusinessIds, toggleCompareBusinessId, setHasComparison } =
    useAppData()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [compareMode, setCompareMode] = useState(false)

  // Renders from the static catalogue instantly (zero network, works
  // offline) — the DB-backed GET /business-types is a non-blocking
  // enrichment pass on top, same "renders now, enriches later if it
  // resolves" shape as lib/feasibility.js's applyRealFactors. A brand-new
  // business type added only to the DB (no app redeploy) will appear here
  // once the fetch resolves; a fully offline device just never sees it.
  const [businessTypes, setBusinessTypes] = useState(BUSINESS_TYPES)
  useEffect(() => {
    let cancelled = false
    getBusinessTypes().then((result) => {
      if (cancelled || !result.ok || result.data.length === 0) return
      const knownIds = new Set(BUSINESS_TYPES.map((b) => b.id))
      const extra = result.data
        .filter((b) => !knownIds.has(b.id))
        .map((b) => ({ id: b.id, icon: b.icon, labelKey: b.nameKey, descKey: b.descKey }))
      if (extra.length > 0) setBusinessTypes([...BUSINESS_TYPES, ...extra])
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Real, nationwide administrative data (GET /geography/*, see
  // lib/geography.js) — 35 states, 628 districts, ~5,900 real blocks by
  // Census name, replacing the old 8-state mock catalogue and its
  // numbered block_1/block_2/block_3 placeholders. Each level loads only
  // once its parent is chosen, cached in localStorage so a device that's
  // loaded its own state once keeps working offline after that
  // (CLAUDE.md rule 4). `statesError`/`districtsError` distinguish
  // "still loading" from "genuinely couldn't load anything, including
  // from cache" — shown honestly rather than a silently empty dropdown.
  const [states, setStates] = useState([])
  const [statesLoading, setStatesLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    getStates().then((result) => {
      if (!cancelled) {
        setStates(result)
        setStatesLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const [districts, setDistricts] = useState([])
  const [districtsLoading, setDistrictsLoading] = useState(false)
  useEffect(() => {
    if (!selection.stateId) {
      setDistricts([])
      return
    }
    let cancelled = false
    setDistrictsLoading(true)
    getDistricts(selection.stateId).then((result) => {
      if (cancelled) return
      setDistricts(result)
      setDistrictsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selection.stateId])

  const selectedDistrict = useMemo(() => districts.find((d) => d.id === selection.districtId) ?? null, [districts, selection.districtId])

  const [blocks, setBlocks] = useState([])
  const [blocksLoading, setBlocksLoading] = useState(false)
  useEffect(() => {
    if (!selectedDistrict) {
      setBlocks([])
      return
    }
    let cancelled = false
    setBlocksLoading(true)
    getBlocks(selectedDistrict.uuid).then((result) => {
      if (cancelled) return
      setBlocks(result)
      setBlocksLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selectedDistrict])

  const stepLabels = [t('wizard.progressStep1'), t('wizard.progressStep2'), t('wizard.progressStep3')]

  const canContinue = () => {
    if (step === 0) return Boolean(selection.stateId && selection.districtId && selection.blockId)
    if (step === 1) return compareMode ? compareBusinessIds.length >= 2 : Boolean(selection.businessId)
    return selection.margin >= MIN_MARGIN
  }

  const goNext = () => {
    if (!canContinue()) return
    if (step === 2) {
      if (compareMode) {
        setHasComparison(true)
        navigate('/compare')
      } else {
        setHasReport(true)
        navigate('/results')
      }
      return
    }
    setDirection(1)
    setStep((s) => s + 1)
  }

  const goBack = () => {
    setDirection(-1)
    setStep((s) => Math.max(0, s - 1))
  }

  const handleMarginInput = (e) => {
    const digits = e.target.value.replace(/[^\d]/g, '')
    const num = digits ? Math.min(MAX_MARGIN, parseInt(digits, 10)) : 0
    updateSelection({ margin: num, marginSource: 'self_reported' })
  }

  const handleVoiceResult = (transcript) => {
    const digits = transcript.replace(/[^\d]/g, '')
    if (!digits) return
    const num = Math.min(MAX_MARGIN, Math.max(0, parseInt(digits, 10)))
    updateSelection({ margin: num, marginSource: 'self_reported' })
  }

  // Extends voice input past the margin field: fuzzy-matches a spoken
  // name against real state names first; once a state is selected, also
  // tries the real districts loaded for it. Block-level voice input stays
  // a tap, not spoken — with ~5,900 real blocks nationwide (vs. the old
  // mock catalogue's tiny fixed list), prefetching every block name to
  // flatten for matching isn't practical, and block selection was never
  // voice-driven even before this. A miss (match === null) is silently
  // ignored — the select dropdowns are always there as the fallback, per
  // CLAUDE.md's feature-detect posture.
  const handleLocationVoiceResult = (transcript) => {
    if (selection.stateId && districts.length > 0) {
      const districtMatch = matchSpokenOption(transcript, districts, (d) => d.name)
      if (districtMatch) {
        updateSelection({ districtId: districtMatch.id, districtName: districtMatch.name, blockId: '', blockName: '' })
        return
      }
    }
    const stateMatch = matchSpokenOption(transcript, states, (s) => s.name)
    if (stateMatch) {
      updateSelection({ stateId: stateMatch.id, stateName: stateMatch.name, districtId: '', districtName: '', blockId: '', blockName: '' })
    }
  }

  const handleBusinessVoiceResult = (transcript) => {
    const match = matchSpokenOption(transcript, businessTypes, (b) => t(b.labelKey))
    if (!match) return
    if (compareMode) toggleCompareBusinessId(match.id)
    else updateSelection({ businessId: match.id })
  }

  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8 py-12 sm:py-16">
      <ProgressBar steps={stepLabels} current={step} />

      <div className="mt-12 rounded-2xl bg-white border border-primary-100 card-shadow-lg p-6 sm:p-10 min-h-[420px] flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1"
          >
            {step === 0 && (
              <div>
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <MapPin size={18} />
                  <span className="text-xs font-semibold uppercase tracking-wide">{t('wizard.stepLabel', { current: 1, total: 3 })}</span>
                </div>
                <h2 className="text-2xl font-bold text-primary-900">{t('wizard.step1Title')}</h2>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-sm text-ink-900/60">{t('wizard.step1Subtitle')}</p>
                  <VoiceInputButton onResult={handleLocationVoiceResult} className="h-8 w-8" />
                </div>

                {states.length === 0 && !statesLoading && (
                  <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[12.5px] text-amber-800">
                    <AlertCircle size={13} className="shrink-0" />
                    {t('wizard.locationLoadError')}
                  </p>
                )}

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-primary-900 mb-2">{t('wizard.stateLabel')}</label>
                    <div className="relative">
                      <select
                        value={selection.stateId}
                        onChange={(e) => {
                          const match = states.find((s) => s.id === e.target.value)
                          updateSelection({
                            stateId: e.target.value,
                            stateName: match?.name ?? '',
                            districtId: '',
                            districtName: '',
                            blockId: '',
                            blockName: '',
                          })
                        }}
                        disabled={statesLoading && states.length === 0}
                        className="w-full appearance-none rounded-xl border border-primary-200 bg-white px-4 py-3 text-[15px] text-ink-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent disabled:bg-primary-50 disabled:text-ink-900/30"
                      >
                        <option value="" disabled>
                          {statesLoading && states.length === 0 ? t('common.loading') : t('wizard.statePlaceholder')}
                        </option>
                        {states.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-400" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary-900 mb-2">{t('wizard.districtLabel')}</label>
                    <div className="relative">
                      <select
                        value={selection.districtId}
                        onChange={(e) => {
                          const match = districts.find((d) => d.id === e.target.value)
                          updateSelection({ districtId: e.target.value, districtName: match?.name ?? '', blockId: '', blockName: '' })
                        }}
                        disabled={!selection.stateId || districtsLoading}
                        className="w-full appearance-none rounded-xl border border-primary-200 bg-white px-4 py-3 text-[15px] text-ink-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent disabled:bg-primary-50 disabled:text-ink-900/30"
                      >
                        <option value="" disabled>
                          {districtsLoading ? t('common.loading') : t('wizard.districtPlaceholder')}
                        </option>
                        {districts.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-400" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-primary-900 mb-2">{t('wizard.blockLabel')}</label>
                    <div className="relative">
                      <select
                        value={selection.blockId}
                        onChange={(e) => {
                          const match = blocks.find((b) => b.id === e.target.value)
                          updateSelection({ blockId: e.target.value, blockName: match?.name ?? '' })
                        }}
                        disabled={!selection.districtId || blocksLoading}
                        className="w-full appearance-none rounded-xl border border-primary-200 bg-white px-4 py-3 text-[15px] text-ink-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent disabled:bg-primary-50 disabled:text-ink-900/30"
                      >
                        <option value="" disabled>
                          {blocksLoading ? t('common.loading') : t('wizard.blockPlaceholder')}
                        </option>
                        {blocks.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-400" />
                    </div>
                  </div>
                </div>

                <LocationDigipin
                  digipin={selection.digipin}
                  selectedStateId={selection.stateId}
                  selectedDistrictId={selection.districtId}
                  onPinned={({ digipin, lat, lon }) => updateSelection({ digipin, digipinLat: lat, digipinLon: lon })}
                  onClear={() => updateSelection({ digipin: '', digipinLat: null, digipinLon: null })}
                  onLocationResolved={({ stateId, stateName, districtId, districtName }) =>
                    updateSelection({ stateId, stateName, districtId, districtName, blockId: '', blockName: '' })
                  }
                />
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">{t('wizard.stepLabel', { current: 2, total: 3 })}</span>
                </div>
                <h2 className="text-2xl font-bold text-primary-900">{t('wizard.step2Title')}</h2>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-sm text-ink-900/60">{t('wizard.step2Subtitle')}</p>
                  <VoiceInputButton onResult={handleBusinessVoiceResult} className="h-8 w-8" />
                </div>

                <label className="mt-4 flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compareMode}
                    onChange={(e) => setCompareMode(e.target.checked)}
                    className="h-4 w-4 rounded accent-primary-700"
                  />
                  <span className="text-sm text-ink-900/70">{t('compare.toggleLabel')}</span>
                </label>
                {compareMode && (
                  <p className="mt-1 text-xs text-ink-900/50">
                    {t('compare.toggleHint')} · {t('compare.selectedCount', { count: compareBusinessIds.length })}
                  </p>
                )}

                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {businessTypes.map((b) => {
                    const selected = compareMode ? compareBusinessIds.includes(b.id) : selection.businessId === b.id
                    return (
                      <motion.button
                        key={b.id}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() =>
                          compareMode ? toggleCompareBusinessId(b.id) : updateSelection({ businessId: b.id })
                        }
                        className={`flex flex-col items-center gap-3 rounded-2xl border-2 px-4 py-6 text-center transition-colors duration-200 ${
                          selected
                            ? 'border-primary-700 bg-primary-50'
                            : 'border-primary-100 bg-white hover:border-primary-300'
                        }`}
                      >
                        <span
                          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                            selected ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-700'
                          }`}
                        >
                          <Icon name={b.icon} size={22} />
                        </span>
                        <span className="text-sm font-semibold text-primary-900">{t(b.labelKey)}</span>
                        <span className="text-[11px] text-ink-900/50 leading-snug">{t(b.descKey)}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">{t('wizard.stepLabel', { current: 3, total: 3 })}</span>
                </div>
                <h2 className="text-2xl font-bold text-primary-900">{t('wizard.step3Title')}</h2>
                <p className="mt-2 text-sm text-ink-900/60">{t('wizard.step3Subtitle')}</p>

                <div className="mt-10">
                  <label className="block text-sm font-medium text-primary-900 mb-2">{t('wizard.marginLabel')}</label>
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-primary-200 focus-within:border-primary-500 bg-primary-50/40 px-5 py-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-700 text-white shrink-0">
                      <IndianRupee size={18} />
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatIndianNumber(selection.margin)}
                      onChange={handleMarginInput}
                      className="w-full bg-transparent text-3xl font-extrabold text-primary-900 tracking-tight focus:outline-none"
                    />
                    <VoiceInputButton onResult={handleVoiceResult} />
                  </div>
                  <p className="mt-2 text-xs text-ink-900/50">{t('wizard.marginHelp')}</p>

                  <div className="mt-8">
                    <label className="block text-xs font-medium text-ink-900/50 mb-3">{t('wizard.sliderLabel')}</label>
                    <input
                      type="range"
                      min={MIN_MARGIN}
                      max={MAX_MARGIN}
                      step={STEP_MARGIN}
                      value={selection.margin}
                      onChange={(e) => updateSelection({ margin: Number(e.target.value), marginSource: 'self_reported' })}
                      className="w-full accent-primary-700 h-2 cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] text-ink-900/40 mt-1.5">
                      <span>₹{formatIndianNumber(MIN_MARGIN)}</span>
                      <span>₹{formatIndianNumber(MAX_MARGIN)}</span>
                    </div>
                  </div>

                  <div className="mt-8 rounded-xl border border-dashed border-primary-200 bg-primary-50/30 p-5">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-primary-900">{t('wizard.categoryLabel')}</label>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-400">{t('common.optional')}</span>
                    </div>
                    <p className="text-xs text-ink-900/50 mb-3">{t('wizard.categoryHelp')}</p>
                    <div className="relative">
                      <select
                        value={selection.categoryId}
                        onChange={(e) => updateSelection({ categoryId: e.target.value })}
                        className="w-full appearance-none rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                      >
                        <option value="">{t('wizard.categoryPlaceholder')}</option>
                        {SOCIAL_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>{t(c.labelKey)}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-400" />
                    </div>
                    <label className="mt-3 flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selection.isWomanOwned}
                        onChange={(e) => updateSelection({ isWomanOwned: e.target.checked })}
                        className="h-4 w-4 rounded accent-primary-700"
                      />
                      <span className="text-sm text-ink-900/70">{t('wizard.womanOwnedLabel')}</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-between pt-6 border-t border-primary-100">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-700 disabled:opacity-0 hover:bg-primary-50 transition-colors"
          >
            <ArrowLeft size={16} />
            {t('common.back')}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue()}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-7 py-3 text-sm font-semibold text-white shadow-md shadow-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-400 transition-colors"
          >
            {step === 2 ? (compareMode ? t('compare.generateCta') : t('wizard.generateReport')) : t('common.continue')}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
