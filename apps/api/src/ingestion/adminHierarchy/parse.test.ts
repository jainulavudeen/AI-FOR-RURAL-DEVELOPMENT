import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAdminHierarchy } from './parse.js'

let dir: string
let csvPath: string

function writeCsv(rows: string[]) {
  const header = 'shrid2,state_name,district_name,subdistrict_name,town_name,village_name,place_name'
  writeFileSync(csvPath, [header, ...rows].join('\n'))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'admin-hierarchy-test-'))
  csvPath = join(dir, 'shrid_loc_names.csv')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseAdminHierarchy', () => {
  it('deduplicates to one row per unique state/district/block, from many village rows', () => {
    writeCsv([
      '11-09-132-00701-000001,uttar pradesh,saharanpur,behat,,alpha,alpha',
      '11-09-132-00701-000002,uttar pradesh,saharanpur,behat,,beta,beta', // same block, different village
      '11-09-132-00702-000003,uttar pradesh,saharanpur,nakur,,gamma,gamma', // same district, different block
      '11-08-099-00457-000004,rajasthan,ganganagar,karanpur,,delta,delta', // different state entirely
    ])

    const result = parseAdminHierarchy(csvPath)

    expect(result.states).toHaveLength(2)
    expect(result.districts).toHaveLength(2)
    expect(result.blocks).toHaveLength(3)
    expect(result.rejectedCount).toBe(0)
  })

  it('slugifies real names into the client-facing id shape, and titlecases the display name', () => {
    writeCsv(['11-09-132-00701-000001,uttar pradesh,saharanpur,behat,,alpha,alpha'])
    const result = parseAdminHierarchy(csvPath)

    expect(result.states[0]).toEqual({ code: '11-09', stateCode: 'uttar_pradesh', stateName: 'Uttar Pradesh' })
    expect(result.districts[0]).toEqual({
      code: '11-09-132',
      stateCode: 'uttar_pradesh',
      stateName: 'Uttar Pradesh',
      districtSlug: 'saharanpur',
      districtName: 'Saharanpur',
    })
    expect(result.blocks[0]).toEqual({ code: '11-09-132-00701', districtCode: '11-09-132', blockSlug: 'behat', blockName: 'Behat' })
  })

  it('rejects a row with a malformed code or a missing name, without throwing', () => {
    writeCsv([
      '11-09-132-00701-000001,uttar pradesh,saharanpur,behat,,alpha,alpha', // valid
      'not-a-real-code,uttar pradesh,saharanpur,behat,,beta,beta', // malformed shrid2
      '11-09-132-00701-000003,,saharanpur,behat,,gamma,gamma', // missing state name
      '11-09-132-00701-000004,uttar pradesh,saharanpur,,,delta,delta', // missing subdistrict name
    ])

    const result = parseAdminHierarchy(csvPath)

    expect(result.rejectedCount).toBe(3)
    expect(result.blocks).toHaveLength(1) // only the one valid row survives
  })

  it('disambiguates two real subdistricts that happen to slugify to the same value within one district', () => {
    writeCsv([
      '11-09-132-00701-000001,uttar pradesh,saharanpur,block-east,,alpha,alpha',
      '11-09-132-00702-000002,uttar pradesh,saharanpur,block east,,beta,beta', // slugifies identically to the row above
    ])

    const result = parseAdminHierarchy(csvPath)

    expect(result.blocks).toHaveLength(2)
    const slugs = result.blocks.map((b) => b.blockSlug)
    expect(new Set(slugs).size).toBe(2) // both kept, neither silently dropped or merged
    expect(slugs).toContain('block_east')
    expect(slugs).toContain('block_east_2')
  })
})
