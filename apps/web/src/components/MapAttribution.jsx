// Required wherever map-provider data is shown without a map.
//
// Google ("google"): the exact words "Google Maps" (never translated,
// never wrapped), Roboto or a sans-serif fallback, weight 400, 12–16px,
// #5E5E5E on a light background, plus any third-party data providers the
// response names. Text rather than the logo keeps it out of the bundle.
//
// OpenStreetMap ("openstreetmap", the free fallback): ODbL requires
// "© OpenStreetMap contributors" with a link to the copyright page.
export default function MapAttribution({ source, providers = [] }) {
  if (source === 'openstreetmap') {
    return (
      <p className="mt-3 text-[12px] leading-snug text-ink-900/55">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap contributors
        </a>
      </p>
    )
  }
  return (
    <p className="mt-3 text-[12px] leading-snug" style={{ fontFamily: 'Roboto, Arial, sans-serif', fontWeight: 400, color: '#5E5E5E' }}>
      <span className="whitespace-nowrap">Google Maps</span>
      {providers.length > 0 && (
        <span>
          {' · '}
          {providers.map((p, i) => (
            <span key={p.provider}>
              {i > 0 && ', '}
              {p.providerUri ? (
                <a href={p.providerUri} target="_blank" rel="noopener noreferrer" className="underline">
                  {p.provider}
                </a>
              ) : (
                p.provider
              )}
            </span>
          ))}
        </span>
      )}
    </p>
  )
}
