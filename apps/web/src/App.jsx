import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom'
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
import RequireRole from './components/RequireRole'
import { ALL_ROLES } from './lib/routeAccess'

// Route-level code splitting: each page (and whatever it pulls in —
// Recharts on Results/Architecture/OfficerDashboard, framer-motion
// everywhere via PageTransition) ships as its own chunk instead of one
// single bundle every visitor downloads regardless of which screen they
// land on. See RouteSkeleton for the Suspense fallback shown mid-download.
const Landing = lazy(() => import('./pages/Landing'))
const Wizard = lazy(() => import('./pages/Wizard'))
const BahiKhata = lazy(() => import('./pages/BahiKhata'))
const CreditScore = lazy(() => import('./pages/CreditScore'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdvisorSaathi = lazy(() => import('./pages/AdvisorSaathi'))
const BankDossier = lazy(() => import('./pages/BankDossier'))
const Results = lazy(() => import('./pages/Results'))
const Compare = lazy(() => import('./pages/Compare'))
const SchemeComparison = lazy(() => import('./pages/SchemeComparison'))
const Architecture = lazy(() => import('./pages/Architecture'))
const AdminPortal = lazy(() => import('./pages/AdminPortal'))
const SignIn = lazy(() => import('./pages/SignIn'))
const Account = lazy(() => import('./pages/Account'))
const ReviewQueue = lazy(() => import('./pages/ReviewQueue'))
const VerifyApproval = lazy(() => import('./pages/VerifyApproval'))

const APPLICANT = ['applicant']

// Public: Landing, the one sign-in page, the bank-facing QR verification
// page, and the "How it works" explainer. Everything else needs a signed-in
// account of the right role (lib/routeAccess.js has the same table); the
// API enforces all of it again server-side.
function Page({ roles, children }) {
  const content = <PageTransition>{children}</PageTransition>
  return roles ? <RequireRole roles={roles}>{content}</RequireRole> : content
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Page><Landing /></Page>} />
        <Route path="/signin" element={<Page><SignIn /></Page>} />
        <Route path="/verify/:hash" element={<Page><VerifyApproval /></Page>} />
        <Route path="/architecture" element={<Page><Architecture /></Page>} />

        <Route path="/dashboard" element={<Page roles={APPLICANT}><Dashboard /></Page>} />
        <Route path="/eligibility" element={<Page roles={APPLICANT}><Wizard /></Page>} />
        <Route path="/results" element={<Page roles={APPLICANT}><Results /></Page>} />
        <Route path="/compare" element={<Page roles={APPLICANT}><Compare /></Page>} />
        <Route path="/bahi-khata" element={<Page roles={APPLICANT}><BahiKhata /></Page>} />
        <Route path="/credit-score" element={<Page roles={APPLICANT}><CreditScore /></Page>} />
        <Route path="/advisor-saathi" element={<Page roles={APPLICANT}><AdvisorSaathi /></Page>} />
        <Route path="/schemes" element={<Page roles={APPLICANT}><SchemeComparison /></Page>} />
        <Route path="/bank-dossier" element={<Page roles={APPLICANT}><BankDossier /></Page>} />
        <Route path="/bank-dossier/:id" element={<Page roles={ALL_ROLES}><BankDossier /></Page>} />

        <Route path="/review" element={<Page roles={['officer']}><ReviewQueue /></Page>} />
        <Route path="/partners" element={<Navigate to="/review" replace />} />
        <Route path="/admin" element={<Page roles={['admin']}><AdminPortal /></Page>} />
        <Route path="/account" element={<Page roles={ALL_ROLES}><Account /></Page>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  const { isSlow } = useConnectionQuality()

  return (
    <MotionConfig reducedMotion={isSlow ? 'always' : 'never'}>
      <I18nProvider>
        <BrowserRouter>
          <AuthProvider>
            <AppDataProvider>
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
            </AppDataProvider>
          </AuthProvider>
        </BrowserRouter>
      </I18nProvider>
    </MotionConfig>
  )
}
