export interface BusinessTypeRecord {
  id: string
  icon: string
  nameKey: string
  descKey: string
  baseScore: number
}

export interface BusinessTypesDeps {
  getActiveBusinessTypes: () => Promise<BusinessTypeRecord[]>
}

// Trivial on purpose — a thin pass-through, same shape as other read-only
// reference-data services in this repo (schemeRouter's
// getCurrentSchemeRuleVersion, e.g.), kept as its own function rather than
// inlined in the route so it stays independently testable without a route
// harness.
export async function listBusinessTypes(deps: BusinessTypesDeps): Promise<BusinessTypeRecord[]> {
  return deps.getActiveBusinessTypes()
}
