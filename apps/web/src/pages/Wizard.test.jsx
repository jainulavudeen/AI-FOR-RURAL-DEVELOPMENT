import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../i18n/I18nContext'
import { AppDataProvider, useAppData } from '../context/AppDataContext'
import * as geography from '../lib/geography'
import Wizard from './Wizard'

// Bug report (earlier session): "selecting Coimbatore does nothing, even
// though Coimbatore is in the list." That was a race condition in the GPS
// flow, covered separately in LocationDigipin.test.jsx — this file drives
// the plain state -> district -> block cascade itself. Rewritten when the
// Wizard moved from a static 8-state mock catalogue to real, API-backed
// nationwide geography (lib/geography.js) — the fixture below stands in
// for GET /geography/states|districts|blocks so this stays a fast, real
// component test with no network dependency.

const FIXTURE = {
  tamil_nadu: {
    name: 'Tamil Nadu',
    districts: {
      madurai: { uuid: 'uuid-madurai', name: 'Madurai', blocks: [{ id: 'melur', name: 'Melur' }, { id: 'usilampatti', name: 'Usilampatti' }] },
      coimbatore: { uuid: 'uuid-coimbatore', name: 'Coimbatore', blocks: [{ id: 'mettupalayam', name: 'Mettupalayam' }] },
    },
  },
  uttar_pradesh: {
    name: 'Uttar Pradesh',
    districts: {
      saharanpur: { uuid: 'uuid-saharanpur', name: 'Saharanpur', blocks: [{ id: 'behat', name: 'Behat' }, { id: 'nakur', name: 'Nakur' }] },
    },
  },
}

function stubGeography() {
  vi.spyOn(geography, 'getStates').mockResolvedValue(
    Object.entries(FIXTURE).map(([id, s]) => ({ id, name: s.name }))
  )
  vi.spyOn(geography, 'getDistricts').mockImplementation(async (stateId) => {
    const state = FIXTURE[stateId]
    if (!state) return []
    return Object.entries(state.districts).map(([id, d]) => ({ id, uuid: d.uuid, name: d.name }))
  })
  vi.spyOn(geography, 'getBlocks').mockImplementation(async (districtUuid) => {
    for (const state of Object.values(FIXTURE)) {
      for (const district of Object.values(state.districts)) {
        if (district.uuid === districtUuid) return district.blocks
      }
    }
    return []
  })
}

function SelectionProbe() {
  const { selection } = useAppData()
  return (
    <div data-testid="selection-probe">
      {selection.stateId}|{selection.districtId}|{selection.blockId}
    </div>
  )
}

function renderWizard() {
  return render(
    <I18nProvider>
      <AppDataProvider>
        <MemoryRouter>
          <SelectionProbe />
          <Wizard />
        </MemoryRouter>
      </AppDataProvider>
    </I18nProvider>
  )
}

function getSelects() {
  const [stateSelect, districtSelect, blockSelect] = screen.getAllByRole('combobox')
  return { stateSelect, districtSelect, blockSelect }
}

function probeValue() {
  return screen.getByTestId('selection-probe').textContent
}

describe('Wizard location step: real nationwide geography, every fixture state/district/block', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // getBusinessTypes() would otherwise hit the real dev API at
    // localhost:4000 — irrelevant to this test and a source of flakiness.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in test'))))
    stubGeography()
  })

  it('loads real states, then cascades through every district and block for each, updating the selection', async () => {
    renderWizard()
    const { stateSelect } = getSelects()

    await waitFor(() => expect(screen.getAllByRole('option', { name: /Tamil Nadu|Uttar Pradesh/ }).length).toBeGreaterThan(0))

    const brokenCombos = []

    for (const [stateId, state] of Object.entries(FIXTURE)) {
      fireEvent.change(stateSelect, { target: { value: stateId } })
      await waitFor(() => expect(probeValue().split('|')[0]).toBe(stateId))

      const { districtSelect } = getSelects()
      await waitFor(() => expect(districtSelect).not.toBeDisabled())

      for (const [districtId, district] of Object.entries(state.districts)) {
        fireEvent.change(districtSelect, { target: { value: districtId } })
        const [gotState, gotDistrict] = probeValue().split('|')
        if (gotState !== stateId || gotDistrict !== districtId) {
          brokenCombos.push(`${stateId}/${districtId}`)
          continue
        }

        const { blockSelect } = getSelects()
        await waitFor(() => expect(blockSelect).not.toBeDisabled())

        for (const block of district.blocks) {
          fireEvent.change(blockSelect, { target: { value: block.id } })
          const [, , gotBlock] = probeValue().split('|')
          if (gotBlock !== block.id) brokenCombos.push(`${stateId}/${districtId}/${block.id}`)
        }
      }
    }

    expect(brokenCombos).toEqual([])
  })

  it('specifically accepts Coimbatore (the originally reported case)', async () => {
    renderWizard()
    const { stateSelect } = getSelects()

    await waitFor(() => expect(screen.getAllByRole('option', { name: /Tamil Nadu/ }).length).toBeGreaterThan(0))
    fireEvent.change(stateSelect, { target: { value: 'tamil_nadu' } })

    const { districtSelect } = getSelects()
    await waitFor(() => expect(districtSelect).not.toBeDisabled())
    fireEvent.change(districtSelect, { target: { value: 'coimbatore' } })

    await waitFor(() => expect(probeValue()).toBe('tamil_nadu|coimbatore|'))
  })

  it('shows a real block name, not a numbered placeholder, in the block dropdown', async () => {
    renderWizard()
    const { stateSelect } = getSelects()

    await waitFor(() => expect(screen.getAllByRole('option', { name: /Tamil Nadu/ }).length).toBeGreaterThan(0))
    fireEvent.change(stateSelect, { target: { value: 'tamil_nadu' } })
    const { districtSelect } = getSelects()
    await waitFor(() => expect(districtSelect).not.toBeDisabled())
    fireEvent.change(districtSelect, { target: { value: 'madurai' } })

    await waitFor(() => expect(screen.getByRole('option', { name: 'Melur' })).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: /^Block \d/ })).not.toBeInTheDocument()
  })
})
