import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { I18nProvider } from './i18n/I18nContext'
import { AppDataProvider } from './context/AppDataContext'
import { AuthProvider } from './context/AuthContext'
import { useConnectionQuality } from './hooks/useConnectionQuality'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import PageTransition from './components/PageTransition'
import OfflineBanner from './components/OfflineBanner'
import RouteSkeleton from './components/RouteSkeleton'

// Route-level code splitting: each page (and whatever it pulls in —
// Recharts on Results/Architecture/OfficerDashboard, framer-motion
// everywhere via PageTransition) ships as its own chunk instead of one
// single bundle every visitor downloads regardless of which screen they
// land on. See RouteSkeleton for the Suspense fallback shown mid-download.
const Landing = lazy(() => import('./pages/Landing'))
const Wizard = lazy(() => import('./pages/Wizard'))
const BahiKhata = lazy(() => import('./pages/BahiKhata'))
const Results = lazy(() => import('./pages/Results'))
const Compare = lazy(() => import('./pages/Compare'))
const SchemeComparison = lazy(() => import('./pages/SchemeComparison'))
const Architecture = lazy(() => import('./pages/Architecture'))
const OfficerDashboard = lazy(() => import('./pages/OfficerDashboard'))

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
        <Route path="/eligibility" element={<PageTransition><Wizard /></PageTransition>} />
        <Route path="/bahi-khata" element={<PageTransition><BahiKhata /></PageTransition>} />
        <Route path="/results" element={<PageTransition><Results /></PageTransition>} />
        <Route path="/compare" element={<PageTransition><Compare /></PageTransition>} />
        <Route path="/schemes" element={<PageTransition><SchemeComparison /></PageTransition>} />
        <Route path="/architecture" element={<PageTransition><Architecture /></PageTransition>} />
        <Route path="/partners" element={<PageTransition><OfficerDashboard /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  const { isSlow } = useConnectionQuality()

  return (
    <MotionConfig reducedMotion={isSlow ? 'always' : 'never'}>
      <I18nProvider>
        <AuthProvider>
          <AppDataProvider>
            <BrowserRouter>
              <div className="min-h-screen flex flex-col bg-surface">
                <OfflineBanner />
                <Navbar />
                <main className="flex-1">
                  <Suspense fallback={<RouteSkeleton />}>
                    <AnimatedRoutes />
                  </Suspense>
                </main>
                <Footer />
              </div>
            </BrowserRouter>
          </AppDataProvider>
        </AuthProvider>
      </I18nProvider>
    </MotionConfig>
  )
}
