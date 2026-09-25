import { Info, Radio, Store } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import MapAttribution from './MapAttribution'

const CATEGORIES = ['bank', 'market', 'school']

function censusCell(t, figure) {
  if (!figure) return '—'
  if (figure.availableInVillage) return t('liveMaps.censusInVillage')
  if (figure.distanceKm != null) return t('liveMaps.censusAtmKm', { km: figure.distanceKm })
  return t('liveMaps.censusNotInVillage')
}

function liveCell(t, facility) {
  if (!facility) return t('liveMaps.liveNone')
  if (facility.roadDistanceKm != null) {
    return t('liveMaps.liveRoad', { km: facility.roadDistanceKm, minutes: facility.travelMinutes ?? '—' })
  }
  return t('liveMaps.liveStraight', { km: facility.straightLineKm })
}

// "Around your site": Census 2011 facility figures next to live Google
// road distances, plus live competition density. The two sources sit side
// by side on purpose — the Census number is never silently replaced, and
// each carries its own date so the vintage difference is visible.
//
// Renders only what actually resolved: no pin, or offline with nothing
// cached, renders nothing at all (never an empty slot). With Census only
// (offline, or Google capped/unavailable) the live column is simply
// absent rather than blank.
export default function SiteContextCard({ census, live }) {
  const { t, language } = useI18n()
  const competition = live?.competition ?? null
  const nearest = live?.nearestFacilities ?? null
  if (!census && !competition && !nearest) return null

  const isMock = competition?.provider === 'mock' || nearest?.provider === 'mock'
  const liveDate = nearest?.retrievedAt
    ? new Date(nearest.retrievedAt).toLocaleDateString(language === 'en' ? 'en-IN' : language, { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const showDistances = Boolean(census || nearest)

  return (
    <div className="mt-6 rounded-2xl border border-primary-100 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-sm font-bold text-primary-900">{t('liveMaps.title')}</span>
        {(competition || nearest) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10.5px] font-bold text-sky-800">
            <Radio size={11} />
            {t('liveMaps.indicativeBadge')}
          </span>
        )}
        {isMock && (
          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
            {t('liveMaps.mockBadge')}
          </span>
        )}
      </div>
      <p className="text-[12px] text-ink-900/55 mb-4">{t('liveMaps.governmentBasis')}</p>

      {competition && (
        <div className="mb-5 rounded-xl bg-primary-50/50 p-3.5">
          <div className="flex items-center gap-2">
            <Store size={14} className="text-primary-600 shrink-0" />
            <span className="text-[12.5px] text-ink-900/70">{t('liveMaps.competitionTitle', { radius: competition.radiusKm })}</span>
            <span className="ml-auto text-sm font-bold text-primary-900 whitespace-nowrap">
              {competition.capped ? t('liveMaps.competitionCapped', { count: competition.count }) : t('liveMaps.competitionValue', { count: competition.count })}
            </span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-900/55">
            <Info size={12} className="shrink-0 mt-0.5" />
            {t('liveMaps.competitionCaveat')}
          </p>
        </div>
      )}

      {showDistances && (
        <>
          <h4 className="mb-2 text-[12.5px] font-bold text-primary-900">{t('liveMaps.distancesTitle')}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-ink-900/45">
                  <th className="py-1.5 pr-3 font-semibold">{t('liveMaps.colService')}</th>
                  {census && <th className="py-1.5 pr-3 font-semibold">{t('liveMaps.colCensus')}</th>}
                  {nearest && <th className="py-1.5 font-semibold">{t('liveMaps.colLive', { date: liveDate })}</th>}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((category) => (
                  <tr key={category} className="border-t border-primary-50">
                    <td className="py-2 pr-3 font-semibold text-primary-900">{t(`liveMaps.${category}`)}</td>
                    {census && <td className="py-2 pr-3 text-ink-900/70">{censusCell(t, census.facilities[category])}</td>}
                    {nearest && <td className="py-2 text-ink-900/70">{liveCell(t, nearest.facilities[category])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {census ? (
            <p className="mt-2 text-[10.5px] text-ink-900/45">
              {t('liveMaps.censusVillage', { village: census.villageName, km: census.villageDistanceKm })} · {census.vintageLabel}
            </p>
          ) : (
            <p className="mt-2 text-[10.5px] text-ink-900/45">{t('liveMaps.censusNone')}</p>
          )}
          {census && nearest && <p className="mt-1 text-[10.5px] text-ink-900/45">{t('liveMaps.vintageNote')}</p>}
        </>
      )}

      {/* One attribution per source actually shown. Competition is always
          Google; facilities may be Google or the free OpenStreetMap fallback. */}
      {(competition || nearest?.source === 'google') && (
        <MapAttribution source="google" providers={nearest?.source === 'google' ? nearest.attributions ?? [] : []} />
      )}
      {nearest?.source === 'openstreetmap' && <MapAttribution source="openstreetmap" />}
    </div>
  )
}
