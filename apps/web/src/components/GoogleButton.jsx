import { useEffect, useRef, useState } from 'react'
import { getAuthConfig } from '../lib/auth'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
let gisPromise = null

// Loads Google Identity Services only when a Google button is actually on
// screen (the sign-in and account pages) — never part of the app bundle,
// never fetched on the ₹6,000-phone's other screens.
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GIS_SRC
      script.async = true
      script.defer = true
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('GIS unavailable')))
      script.onerror = () => {
        gisPromise = null
        reject(new Error('GIS failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return gisPromise
}

// Renders Google's own button and hands back the opaque ID token
// (`credential`). The server verifies it — this component never decodes
// or trusts anything inside it. Renders nothing when Google sign-in isn't
// configured on the server or the script can't load (offline): phone OTP
// is always there as the other option, so this degrades to absent rather
// than to a broken button (CLAUDE.md rule 4).
export default function GoogleButton({ onCredential, text = 'signin_with', onUnavailable }) {
  const ref = useRef(null)
  const callbackRef = useRef(onCredential)
  const [state, setState] = useState('loading') // loading | ready | unavailable
  callbackRef.current = onCredential

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { googleClientId } = await getAuthConfig()
      if (!googleClientId) throw new Error('not configured')
      const gis = await loadGis()
      if (cancelled || !ref.current) return
      gis.initialize({
        client_id: googleClientId,
        callback: (response) => callbackRef.current?.(response.credential),
        ux_mode: 'popup',
        auto_select: false,
      })
      gis.renderButton(ref.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text,
        width: Math.min(ref.current.offsetWidth || 320, 400),
      })
      setState('ready')
    })().catch(() => {
      if (cancelled) return
      setState('unavailable')
      onUnavailable?.()
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  if (state === 'unavailable') return null
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center" aria-busy={state === 'loading'} />
}
