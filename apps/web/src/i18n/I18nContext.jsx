import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { translations, LANGUAGES } from './translations'

const I18nContext = createContext(null)

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function interpolate(str, vars) {
  if (typeof str !== 'string' || !vars) return str
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState('en')

  const t = useCallback(
    (path, vars) => {
      const dict = translations[language]
      let value = getPath(dict, path)
      if (value === undefined) value = getPath(translations.en, path)
      if (value === undefined) return path
      return interpolate(value, vars)
    },
    [language]
  )

  const raw = useCallback(
    (path) => {
      const dict = translations[language]
      let value = getPath(dict, path)
      if (value === undefined) value = getPath(translations.en, path)
      return value
    },
    [language]
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(
    () => ({ language, setLanguage, t, raw, languages: LANGUAGES }),
    [language, t, raw]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
