// Tailwind-only (no framer-motion dependency) so this still renders and
// pulses even when MotionConfig has switched animation off for a detected
// slow connection — see hooks/useConnectionQuality.js.
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-primary-100/70 ${className}`} />
}
