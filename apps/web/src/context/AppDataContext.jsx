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
}

export function AppDataProvider({ children }) {
  const [selection, setSelectionState] = useState(DEFAULT_SELECTION)
  const [hasReport, setHasReport] = useState(false)

  const updateSelection = (patch) => {
    setSelectionState((prev) => ({ ...prev, ...patch }))
  }

  const resetSelection = () => {
    setSelectionState(DEFAULT_SELECTION)
    setHasReport(false)
  }

  const value = useMemo(
    () => ({ selection, updateSelection, resetSelection, hasReport, setHasReport }),
    [selection, hasReport]
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
