import { useLocation } from 'react-router-dom'
import Skeleton from './Skeleton'

// Shown by App.jsx's Suspense boundary while a lazily-loaded route chunk is
// still downloading. Picks a layout roughly matching the destination page's
// real box heights (by pathname, since the lazy import hasn't resolved yet
// to introspect the component itself) — a first pass that only matched
// header+card shapes loosely measured as a real Cumulative-Layout-Shift
// regression (Lighthouse CLS 0.02 -> 0.37) once the real content swapped
// in at a different height, so these intentionally mirror each page's
// outer section classes (same padding/max-width) to keep the swap close to
// shift-free, not just "look like a page is arriving."

function LandingSkeleton() {
  return (
    <div>
      <section className="relative overflow-hidden bg-primary-950">
        <div className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <Skeleton className="h-7 w-40 mx-auto bg-white/10" />
          <Skeleton className="mt-6 h-14 w-full max-w-3xl mx-auto bg-white/10" />
          <Skeleton className="mt-4 h-14 w-3/4 mx-auto bg-white/10" />
          <Skeleton className="mt-6 h-6 w-full max-w-2xl mx-auto bg-white/10" />
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Skeleton className="h-[52px] w-48 rounded-full bg-white/10" />
            <Skeleton className="h-[52px] w-48 rounded-full bg-white/10" />
          </div>
          <div className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[74px] w-full bg-white/10" />
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
        <Skeleton className="h-8 w-72 mx-auto mb-16" />
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </section>
    </div>
  )
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 sm:py-14">
      <Skeleton className="h-8 w-64 mb-3" />
      <Skeleton className="h-4 w-96 mb-10" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module 1: score, factors, insights, SWOT */}
        <div className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-8 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-52 w-52 rounded-full mx-auto" />
          <div className="space-y-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
        {/* Module 2: margin/loan split, scheme, stats, EMI, schemes */}
        <div className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-8 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-40 rounded-full mx-auto" />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}

function BahiKhataSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="mt-10 mb-3 h-4 w-56" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="mt-10 mb-3 h-4 w-40" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
      <Skeleton className="h-8 w-56 mb-8" />
      <div className="rounded-3xl border border-primary-100 bg-white p-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

function SchemeCompareSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20">
      <div className="max-w-2xl mx-auto mb-14 space-y-3">
        <Skeleton className="h-8 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="rounded-3xl border border-primary-100 bg-white p-6 space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

// Mirrors Wizard.jsx's own structure exactly, including its `min-h-[420px]`
// card — that fixed min-height means this skeleton and the real step-1
// content land at the same height regardless of which step a returning
// user's saved selection would resume on.
function FormSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8 py-12 sm:py-16">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            {i < 2 && <div className="flex-1 h-[2px] mx-2 mb-5 bg-primary-100" />}
          </div>
        ))}
      </div>
      <div className="mt-12 rounded-2xl bg-white border border-primary-100 p-6 sm:p-10 min-h-[420px] flex flex-col">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="mt-6 h-14 w-full" />
        </div>
        <div className="mt-10 flex items-center justify-between pt-6 border-t border-primary-100">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-11 w-36 rounded-full" />
        </div>
      </div>
    </div>
  )
}

function ArchitectureSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8 py-14 sm:py-20">
      <div className="max-w-2xl mx-auto mb-16 space-y-3">
        <Skeleton className="h-8 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="rounded-3xl border border-primary-100 bg-white p-6 sm:p-10 space-y-8">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-5">
            <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-2 pt-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="flex items-start gap-5">
          <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2 pt-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-primary-100 bg-white p-6 sm:p-10 space-y-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-primary-100 bg-white p-6 sm:p-10 space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="mt-4 space-y-3.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-primary-100 bg-white p-6 sm:p-10">
        <Skeleton className="h-5 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  )
}

export default function RouteSkeleton() {
  const { pathname } = useLocation()

  if (pathname === '/') return <LandingSkeleton />
  if (pathname === '/results') return <ResultsSkeleton />
  if (pathname === '/partners') return <TableSkeleton />
  if (pathname === '/schemes' || pathname === '/compare') return <SchemeCompareSkeleton />
  if (pathname === '/eligibility') return <FormSkeleton />
  if (pathname === '/bahi-khata') return <BahiKhataSkeleton />
  if (pathname === '/architecture') return <ArchitectureSkeleton />
  return <FormSkeleton />
}
