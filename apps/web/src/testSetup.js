import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement scrollIntoView at all (not even a no-op) — any
// component that calls it (AdvisorSaathi's auto-scroll-to-latest-message,
// and potentially future ones) throws under test otherwise.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

afterEach(() => {
  cleanup()
})
