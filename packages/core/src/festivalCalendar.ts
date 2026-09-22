// A static, offline-first Indian festival/demand calendar — deliberately
// NOT a live Google Calendar integration (a reference prototype's own
// marketing claimed one; this repo has no OAuth flow, no calendar API key,
// and per CLAUDE.md's target user — 2G, a cheap Android phone — a static
// local dataset is a strictly better fit than a network dependency for
// something the Dashboard needs to render instantly, offline, every time).
//
// Lives in packages/core (not apps/web/src/data/) for the same reason
// schemes.ts does rather than sitting in a web-only data folder: it's read
// by both the Dashboard (client) and Advisor Saathi's context-builder
// (server, a later phase) — genuine cross-app reuse, not a UI-only catalog
// like locations.js/businesses.js.
//
// Deterministic, synchronous, no I/O — same boundary as calculator.ts.
//
// `demandSurgePercent` is a clearly-labelled EDITORIAL ESTIMATE, not
// sourced retrieval data — deliberately not wired to
// apps/api/feasibility/service.ts's getLocalDemandSignal, which is a
// coarse Agmarknet mandi-activity proxy real for only 2 of 5 business
// types and only the seeded Madurai pilot district (see CLAUDE.md's Known
// Gaps), with no seasonal semantics at all. Claiming a link between that
// signal and a specific festival's demand would fabricate a connection
// the data can't support — worse than an honest static number. Any UI
// surfacing this percent must label it as an estimate, same posture as
// informalLendingRates's "Illustrative regional estimate."
//
// Dates are a fixed calendar-day approximation, not a real lunar-calendar
// computation — several of these festivals (Holi, Ugadi, Raksha Bandhan,
// Ganesh Chaturthi, Navratri/Dussehra, Diwali, Chhath) shift by weeks
// year-to-year on the actual lunar/solar-lunar calendar. A fixed date is
// wrong for exact countdown precision in years other than the one it was
// written against, but right enough for "roughly this time of year, stock
// up" — the same honesty trade-off the rest of this dataset makes.
export interface FestivalEvent {
  id: string
  nameKey: string
  // 1-12, 1-31 — see the lunar-calendar caveat above.
  month: number
  day: number
  // 'national' or a list of stateIds (see stateSchemes.ts for the id list)
  // where this festival's commerce impact is most pronounced.
  regionScope: 'national' | string[]
  stockCategoryKeys: string[]
  // BUSINESS_TYPES ids (apps/web/src/data/businesses.js) this festival is
  // most relevant to — used to filter, not to gate: a business not listed
  // can still see the festival, just not have it prioritized.
  businessRelevance: string[]
  demandSurgePercent: number
}

export const FESTIVAL_CALENDAR: FestivalEvent[] = [
  {
    id: 'makar_sankranti_pongal',
    nameKey: 'festival.makarSankrantiPongal',
    month: 1,
    day: 14,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.tilGudSweets', 'festivalStock.sugarcane', 'festivalStock.riceJaggery'],
    businessRelevance: ['retail', 'dairy'],
    demandSurgePercent: 25,
  },
  {
    id: 'holi',
    nameKey: 'festival.holi',
    month: 3,
    day: 14,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.colorsGulal', 'festivalStock.sweetsGujiya', 'festivalStock.snacks'],
    businessRelevance: ['retail'],
    demandSurgePercent: 30,
  },
  {
    id: 'ugadi_gudi_padwa',
    nameKey: 'festival.ugadiGudiPadwa',
    month: 3,
    day: 30,
    regionScope: ['maharashtra', 'karnataka'],
    stockCategoryKeys: ['festivalStock.neemJaggery', 'festivalStock.sweets'],
    businessRelevance: ['retail'],
    demandSurgePercent: 20,
  },
  {
    id: 'raksha_bandhan',
    nameKey: 'festival.rakshaBandhan',
    month: 8,
    day: 9,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.rakhi', 'festivalStock.sweets', 'festivalStock.giftItems'],
    businessRelevance: ['retail', 'textiles'],
    demandSurgePercent: 25,
  },
  {
    id: 'ganesh_chaturthi',
    nameKey: 'festival.ganeshChaturthi',
    month: 8,
    day: 27,
    regionScope: ['maharashtra'],
    stockCategoryKeys: ['festivalStock.modakIngredients', 'festivalStock.decorationItems'],
    businessRelevance: ['retail'],
    demandSurgePercent: 30,
  },
  {
    id: 'navratri_dussehra',
    nameKey: 'festival.navratriDussehra',
    month: 10,
    day: 11,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.sabudanaKuttuSinghara', 'festivalStock.sendhaNamakGhee', 'festivalStock.pujaItems'],
    businessRelevance: ['retail', 'textiles'],
    demandSurgePercent: 38,
  },
  {
    id: 'diwali',
    nameKey: 'festival.diwali',
    month: 11,
    day: 6,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.dryFruitsGiftHampers', 'festivalStock.sugarBesanMaida', 'festivalStock.oilGheeDiyas'],
    businessRelevance: ['retail', 'dairy', 'textiles'],
    demandSurgePercent: 48,
  },
  {
    id: 'chhath_puja',
    nameKey: 'festival.chhathPuja',
    month: 11,
    day: 15,
    regionScope: ['uttar_pradesh', 'bihar'],
    stockCategoryKeys: ['festivalStock.thekuaWheatFlour', 'festivalStock.jaggeryGhee', 'festivalStock.bambooBaskets'],
    businessRelevance: ['retail'],
    demandSurgePercent: 42,
  },
  {
    id: 'kharif_harvest_payouts',
    nameKey: 'festival.kharifHarvestPayouts',
    month: 11,
    day: 20,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.bulkGrainBags', 'festivalStock.teaDetergents', 'festivalStock.consumerPackagedGoods'],
    businessRelevance: ['retail', 'poultry', 'manufacturing'],
    demandSurgePercent: 28,
  },
  {
    id: 'christmas_new_year',
    nameKey: 'festival.christmasNewYear',
    month: 12,
    day: 25,
    regionScope: 'national',
    stockCategoryKeys: ['festivalStock.cakesSweets', 'festivalStock.giftItems', 'festivalStock.decorations'],
    businessRelevance: ['retail'],
    demandSurgePercent: 20,
  },
]

function daysUntil(fromDate: Date, month: number, day: number): number {
  const year = fromDate.getFullYear()
  let target = new Date(year, month - 1, day)
  target.setHours(0, 0, 0, 0)
  const from = new Date(fromDate)
  from.setHours(0, 0, 0, 0)
  if (target.getTime() < from.getTime()) {
    target = new Date(year + 1, month - 1, day)
  }
  return Math.round((target.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}

export interface UpcomingFestival extends FestivalEvent {
  daysLeft: number
}

// Pure and synchronous — needs zero network call, ever, so the Dashboard's
// festival card can render fully offline the moment the page loads.
export function getUpcomingFestivals(
  fromDate: Date,
  stateId: string | null | undefined,
  businessId: string | null | undefined,
  windowDays = 75
): UpcomingFestival[] {
  return FESTIVAL_CALENDAR.map((event) => ({ ...event, daysLeft: daysUntil(fromDate, event.month, event.day) }))
    .filter((event) => event.daysLeft <= windowDays)
    .filter((event) => event.regionScope === 'national' || !stateId || event.regionScope.includes(stateId))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .sort((a, b) => {
      // Business-relevant events first within the same rough timeframe,
      // without completely hiding non-relevant ones — a stable sort on top
      // of the days-left sort above keeps chronological order intact
      // within each relevance group.
      if (!businessId) return 0
      const aRelevant = a.businessRelevance.includes(businessId)
      const bRelevant = b.businessRelevance.includes(businessId)
      if (aRelevant === bRelevant) return 0
      return aRelevant ? -1 : 1
    })
}
