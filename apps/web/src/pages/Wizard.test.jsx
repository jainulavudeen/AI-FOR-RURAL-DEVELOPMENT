import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../i18n/I18nContext'
import { AppDataProvider, useAppData } from '../context/AppDataContext'
import { LOCATIONS, STATE_IDS } from '../data/locations'
import Wizard from './Wizard'

// Bug report: "selecting Coimbatore does nothing, even though Coimbatore is
// in the list." Investigation found the state/district/block cascade
// itself (this file, data/locations.js) has no id/value mismatch anywhere
// — the real defect was a GPS race condition, covered separately in
// LocationDigipin.test.jsx. This test exhaustively drives every state and
// district in the dataset through the real dropdowns and asserts the
// selection actually updates each time, so a future regression in the
// cascade itself (not just the GPS race) gets caught here.

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

describe('Wizard location step: every state/district in the dataset', () => {
  let brokenCombos = []

  beforeEach(() => {
    // getBusinessTypes() would otherwise hit the real dev API at
    // localhost:4000 — irrelevant to this test and a source of flakiness.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test')))
    )
    brokenCombos = []
  })

  it('accepts every state -> district -> block selection in the mock catalogue', () => {
    renderWizard()
    const { stateSelect, districtSelect, blockSelect } = getSelects()

    for (const stateId of STATE_IDS) {
      fireEvent.change(stateSelect, { target: { value: stateId } })
      if (probeValue().split('|')[0] !== stateId) brokenCombos.push(`state:${stateId}`)

      for (const district of LOCATIONS[stateId].districts) {
        fireEvent.change(districtSelect, { target: { value: district.id } })
        const [gotState, gotDistrict] = probeValue().split('|')
        if (gotState !== stateId || gotDistrict !== district.id) {
          brokenCombos.push(`${stateId}/${district.id}`)
          continue
        }

        for (const block of district.blocks) {
          fireEvent.change(blockSelect, { target: { value: block.id } })
          const [, , gotBlock] = probeValue().split('|')
          if (gotBlock !== block.id) brokenCombos.push(`${stateId}/${district.id}/${block.id}`)
        }
      }
    }

    const totalDistricts = STATE_IDS.reduce((sum, id) => sum + LOCATIONS[id].districts.length, 0)
    // eslint-disable-next-line no-console
    console.log(`Wizard location cascade: ${totalDistricts} districts tested across ${STATE_IDS.length} states, ${brokenCombos.length} broken.`)
    expect(brokenCombos).toEqual([])
  })

  it('specifically accepts Coimbatore (the reported case)', () => {
    renderWizard()
    const { stateSelect, districtSelect } = getSelects()

    fireEvent.change(stateSelect, { target: { value: 'tamil_nadu' } })
    fireEvent.change(districtSelect, { target: { value: 'coimbatore' } })

    expect(probeValue()).toBe('tamil_nadu|coimbatore|')
  })
})
