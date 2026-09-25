import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Setu — Business Advisory for Rural Entrepreneurs',
        short_name: 'Setu',
        description: 'AI-driven hyper-local business advisory and financial structuring assistant for rural micro-entrepreneurs.',
        theme_color: '#1e3a5f',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-shell + static assets cached on install so the wizard and a
        // previously generated report keep working with no connectivity —
        // the core "offline-first" promise for low-connectivity rural use.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'setu-pages', networkTimeoutSeconds: 3 },
          },
          {
            // The 3 real, unauthenticated GET signals Results.jsx overlays
            // onto the offline-first seeded baseline (see lib/marketData.js)
            // — StaleWhileRevalidate so a report already viewed once keeps
            // showing its real factors with no connectivity, while a
            // background refetch keeps the cache from going stale
            // indefinitely when online. TTLs mirror each signal's own
            // server-side freshness window (informal-lending-rate and
            // district-id: districtBlockCache.ts's 24h; local-demand:
            // agmarknetCache.ts's 6h FRESH_SECONDS) — see docs/cdn-config.md.
            urlPattern: ({ url }) =>
              url.pathname === '/feasibility/district-id' ||
              url.pathname === '/feasibility/local-demand' ||
              url.pathname === '/feasibility/informal-lending-rate',
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'setu-feasibility-signals',
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            // Census 2011 facility figures near the report's pin — our own
            // government data, so a report viewed once keeps its Census
            // column offline. Separate cache from the signals above: one
            // entry per pin, and a longer life (the data is from 2011).
            urlPattern: ({ url }) => url.pathname === '/feasibility/census-facilities',
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'setu-census-facilities',
              expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Google Maps enhancement: explicitly NEVER cached. Google's
            // terms don't allow keeping its content, and the server also
            // sends Cache-Control: no-store. Stated as its own rule so a
            // future broad pattern can't sweep these paths into a cache.
            urlPattern: ({ url }) => url.pathname.startsWith('/google-maps/'),
            handler: 'NetworkOnly',
          },
          {
            // "Flag this data" / "Request Human Review" while offline: the
            // service worker queues the failed POST and replays it once
            // connectivity returns, instead of the user seeing an error or
            // losing the submission silently. Coupled with
            // src/lib/feedback.js, which treats a thrown fetch to these
            // exact two paths as "queued", not "failed" — if either
            // changes, check the other. Known limitation (see CLAUDE.md):
            // a replay after the 15-minute access token has expired gets a
            // 401, which Workbox counts as delivered — it won't retry again.
            urlPattern: ({ url }) => url.pathname === '/feedback/flag' || url.pathname === '/feedback/appeal',
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'setu-feedback-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            // Geotagged site-capture uploads (compressed photo + DIGIPIN,
            // see components/SiteCaptureCard.jsx) — same background-sync
            // shape as the feedback queue above, coupled to
            // lib/siteCapture.js's uploadSiteCapture. A separate queue name
            // so a large queued photo upload can't starve the smaller
            // flag/appeal queue's retry budget.
            urlPattern: ({ url }) => url.pathname === '/site-capture',
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'setu-site-capture-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            // Logging a Bahi-Khata sale/expense/udhaar entry while offline —
            // the one write this whole app most needs to survive a signal
            // drop, since it's the daily-use screen. Same NetworkOnly +
            // backgroundSync shape as feedback's flag/appeal queue above,
            // its own queue name so it isn't starved by (or doesn't starve)
            // the others. Coupled with lib/ledger.js's recordTransaction,
            // which treats a thrown fetch to this exact path as "queued" —
            // if either changes, check the other.
            urlPattern: ({ url }) => url.pathname === '/ledger/transactions',
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'setu-ledger-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            // Ledger reads: cached so Bahi-Khata/Credit Score/Dashboard
            // keep showing the last-known transaction list and summary
            // instantly offline, refreshed in the background when online —
            // same StaleWhileRevalidate shape as the feasibility signals
            // above, just a shorter TTL since this is the applicant's own
            // fast-changing data, not a slower-moving external dataset.
            urlPattern: ({ url }) => url.pathname === '/ledger/transactions' || url.pathname === '/ledger/summary',
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'setu-ledger-reads',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // A generated Bank Dossier is immutable (no update route
            // exists) — so unlike the ledger reads above, a much longer
            // TTL is correct: reprinting an already-generated dossier
            // should keep working offline for as long as it's cached.
            // Only matches GET /bank-dossier/<id>, never the POST
            // /bank-dossier/generate write.
            urlPattern: ({ url }) => /^\/bank-dossier\/[0-9a-f-]+$/i.test(url.pathname),
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'setu-bank-dossier-reads',
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
})
