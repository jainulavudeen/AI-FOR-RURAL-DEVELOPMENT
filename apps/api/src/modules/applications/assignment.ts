// Who reviews a submitted application — pure, so the routing rule is
// unit-tested without a database.
//
// Rule (in order):
//  1. Only ACTIVE officers whose jurisdiction covers the applicant's block
//     are candidates — either that exact block, or its whole district.
//  2. An officer assigned that exact block beats one covering the whole
//     district (the more specific assignment is the one the admin meant).
//  3. Among equally-specific officers, the fewest open cases wins
//     (submitted + under_review); ties go to the officer listed first,
//     which the caller orders by officer id so it's deterministic.
//  4. No candidate → null → the admin's unassigned queue. Never a random
//     officer from somewhere else.

export interface CoveringOfficer {
  officerId: string
  // 'block' = jurisdiction row names this exact block; 'district' = the
  // row has block_id null (whole district).
  scope: 'block' | 'district'
  openCount: number
}

export function pickOfficerForBlock(candidates: CoveringOfficer[]): string | null {
  if (candidates.length === 0) return null
  const blockLevel = candidates.filter((c) => c.scope === 'block')
  const pool = blockLevel.length > 0 ? blockLevel : candidates
  return pool.reduce((min, cur) => (cur.openCount < min.openCount ? cur : min)).officerId
}
