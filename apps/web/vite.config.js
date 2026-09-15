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
        ],
      },
    }),
  ],
})
