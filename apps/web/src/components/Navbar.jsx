import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Menu, X, Landmark } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import AuthControl from './AuthControl'

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

const linkClass = ({ isActive }) =>
  `whitespace-nowrap text-[13px] font-medium transition-colors ${
    isActive ? 'text-primary-700' : 'text-ink-900/70 hover:text-primary-700'
  }`

function MoreMenu({ links }) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isActive = links.some((l) => pathname === l.to)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 whitespace-nowrap text-[13px] font-medium transition-colors ${
          isActive ? 'text-primary-700' : 'text-ink-900/70 hover:text-primary-700'
        }`}
      >
        {t('nav.more')}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 flex min-w-[10rem] flex-col gap-3 rounded-xl border border-primary-100 bg-white p-3 shadow-lg"
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass} onClick={() => setOpen(false)}>
                {t(l.key)}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Navbar() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const closeMenu = () => setOpen(false)
  const toggleMenu = () => setOpen((v) => !v)

  // The full row (primary + "More") is what the mobile menu flattens back
  // out to one list — keep this the single source of truth for link order.
  const primaryLinks = [
    { to: '/', key: 'nav.home', end: true },
    { to: '/dashboard', key: 'nav.dashboard' },
    { to: '/eligibility', key: 'nav.checkEligibility' },
    { to: '/bahi-khata', key: 'nav.bahiKhata' },
    { to: '/credit-score', key: 'nav.creditScore' },
    { to: '/advisor-saathi', key: 'nav.advisorSaathi' },
    { to: '/schemes', key: 'nav.schemes' },
  ]
  const moreLinks = [
    { to: '/bank-dossier', key: 'nav.bankDossier' },
    { to: '/architecture', key: 'nav.architecture' },
    { to: '/partners', key: 'nav.partners' },
    { to: '/admin', key: 'nav.admin' },
  ]
  const links = [...primaryLinks, ...moreLinks]

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-primary-100/70">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0" onClick={closeMenu}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-700 text-white">
              <Landmark size={18} strokeWidth={2.2} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold text-primary-900">{t('nav.brandName')}</span>
              <span className="hidden text-[11px] text-ink-900/50 xl:block">{t('nav.brandTagline')}</span>
            </span>
          </NavLink>

          {/* 10 nav items is genuinely dense — even the trimmed row (7 links
              + "More", holding the other 3) plus sign-in and the language
              switcher needs ~1248px measured live; anything narrower must
              go to the hamburger. So this collapses at xl (1280px), not lg
              (1024px) — verified live at 1024–1600px: below xl, showing the
              row instead overflows the header and pushes sign-in / language
              switcher off-screen with no scroll affordance, which is the
              exact bug ("can't reach other pages") this replaced. */}
          <nav className="hidden xl:flex items-center gap-4 xl:gap-5">
            {primaryLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {t(l.key)}
              </NavLink>
            ))}
            <MoreMenu links={moreLinks} />
          </nav>

          <div className="hidden xl:flex items-center gap-3 shrink-0">
            <AuthControl />
            <LanguageSwitcher />
          </div>

          <button
            className="xl:hidden p-2 -mr-2 text-primary-900"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          // Two separate panels, not one. AuthControl itself has no popover
          // now (sign-in opens the global, fixed-position AuthModal
          // mounted at the App root, not a dropdown anchored here), but the
          // split is kept: the links panel needs overflow-hidden for its
          // 0->auto height slide, and keeping controls in their own
          // opacity-only panel avoids re-introducing that clipping risk if
          // this ever grows a dropdown again.
          <>
            <motion.div
              key="links"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="xl:hidden overflow-hidden border-t border-primary-100 bg-white"
            >
              <div className="flex flex-col gap-4 px-5 py-5">
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={linkClass} onClick={closeMenu}>
                    {t(l.key)}
                  </NavLink>
                ))}
              </div>
            </motion.div>
            <motion.div
              key="controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="xl:hidden flex flex-col gap-3 border-t border-primary-100 bg-white px-5 py-5"
            >
              <AuthControl />
              <LanguageSwitcher />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}
