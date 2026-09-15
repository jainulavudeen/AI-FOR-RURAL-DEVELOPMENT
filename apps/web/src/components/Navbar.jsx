import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Landmark } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import OtpLogin from './OtpLogin'

function LanguageSwitcher() {
  const { language, setLanguage, languages } = useI18n()
  return (
    <div className="flex items-center gap-1 rounded-full bg-primary-50 p-1 border border-primary-100">
      {languages.map((l) => (
        <button
          key={l.code}
          onClick={() => setLanguage(l.code)}
          aria-pressed={language === l.code}
          aria-label={`Switch language to ${l.label}`}
          className={`relative px-3 py-1.5 text-sm font-semibold rounded-full transition-colors duration-200 ${
            language === l.code ? 'text-white' : 'text-primary-700 hover:text-primary-900'
          }`}
        >
          {language === l.code && (
            <motion.span
              layoutId="lang-pill"
              className="absolute inset-0 rounded-full bg-primary-700"
              transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
            />
          )}
          <span className="relative z-10">{l.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function Navbar() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const links = [
    { to: '/', key: 'nav.home', end: true },
    { to: '/eligibility', key: 'nav.checkEligibility' },
    { to: '/schemes', key: 'nav.schemes' },
    { to: '/architecture', key: 'nav.architecture' },
    { to: '/partners', key: 'nav.partners' },
  ]

  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors ${isActive ? 'text-primary-700' : 'text-ink-900/70 hover:text-primary-700'}`

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-primary-100/70">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex h-16 items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white">
              <Landmark size={18} strokeWidth={2.2} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold text-primary-900">{t('nav.brandName')}</span>
              <span className="hidden text-[11px] text-ink-900/50 sm:block">{t('nav.brandTagline')}</span>
            </span>
          </NavLink>

          <nav className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {t(l.key)}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <OtpLogin />
            <LanguageSwitcher />
          </div>

          <button
            className="md:hidden p-2 -mr-2 text-primary-900"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden overflow-hidden border-t border-primary-100 bg-white"
          >
            <div className="flex flex-col gap-4 px-5 py-5">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkClass} onClick={() => setOpen(false)}>
                  {t(l.key)}
                </NavLink>
              ))}
              <div className="flex flex-col gap-3 pt-2">
                <OtpLogin />
                <LanguageSwitcher />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
