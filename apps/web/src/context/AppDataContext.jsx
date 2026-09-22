import { createContext, useContext, useMemo, useState } from 'react'

const AppDataContext = createContext(null)

const DEFAULT_SELECTION = {
  stateId: '',
  districtId: '',
  blockId: '',
  businessId: '',
  margin: 20000,
  // 'self_reported' (default, always available) or 'aa' (Account
  // Aggregator-verified — only after explicit opt-in). See
  // components/AccountAggregatorOptIn.jsx.
  marginSource: 'self_reported',
  categoryId: '',
  isWomanOwned: false,
  // Optional precision tag alongside the required state/district/block
  // dropdowns — see components/LocationDigipin.jsx. Never resolves to a
  // dropdown selection itself: no district/block boundary data exists yet
  // to do that nationwide (CLAUDE.md Known Gaps).
  digipin: '',
  digipinLat: null,
  digipinLon: null,
}

// Business-comparison mode is a separate, additive selection — not a
// change to `businessId`/`hasReport` above. Keeping them independent means
// the existing single-business Wizard -> Results path needs no changes at
// all; comparison is purely "also, optionally, 2-3 ids here" (see
// Wizard.jsx's compare toggle and pages/Compare.jsx).
export function AppDataProvider({ children }) {
  const [selection, setSelectionState] = useState(DEFAULT_SELECTION)
  const [hasReport, setHasReport] = useState(false)
  const [compareBusinessIds, setCompareBusinessIds] = useState([])
  const [hasComparison, setHasComparison] = useState(false)

  const updateSelection = (patch) => {
    setSelectionState((prev) => ({ ...prev, ...patch }))
  }

  const toggleCompareBusinessId = (businessId) => {
    setCompareBusinessIds((prev) => {
      if (prev.includes(businessId)) return prev.filter((id) => id !== businessId)
      if (prev.length >= 3) return prev
      return [...prev, businessId]
    })
  }

  // Lets a caller (e.g. the Results page's "compare both" suggestion) jump
  // straight to a specific comparison set, rather than going through the
  // Wizard's tap-to-toggle grid one business at a time.
  const startComparison = (businessIds) => {
    setCompareBusinessIds(businessIds.slice(0, 3))
    setHasComparison(true)
  }

  const resetSelection = () => {
    setSelectionState(DEFAULT_SELECTION)
    setHasReport(false)
    setCompareBusinessIds([])
    setHasComparison(false)
  }

  const value = useMemo(
    () => ({
      selection,
      updateSelection,
      resetSelection,
      hasReport,
      setHasReport,
      compareBusinessIds,
      toggleCompareBusinessId,
      startComparison,
      hasComparison,
      setHasComparison,
    }),
    [selection, hasReport, compareBusinessIds, hasComparison]
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
