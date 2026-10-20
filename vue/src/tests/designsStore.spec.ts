import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const createDesignMock = vi.fn()
const listSelectionsMock = vi.fn()
const getDesignMock = vi.fn()
const updateDesignMock = vi.fn()
const selectDesignMock = vi.fn()
const updateSelectionMock = vi.fn()
const deleteSelectionMock = vi.fn()
const getSelectionCountMock = vi.fn()
const getLastRunStatusesMock = vi.fn()

vi.mock('@/services/designs', () => ({
  createDesign: (...args: unknown[]) => createDesignMock(...args),
  listSelections: (...args: unknown[]) => listSelectionsMock(...args),
  getDesign: (...args: unknown[]) => getDesignMock(...args),
  updateDesign: (...args: unknown[]) => updateDesignMock(...args),
  selectDesign: (...args: unknown[]) => selectDesignMock(...args),
  updateSelection: (...args: unknown[]) => updateSelectionMock(...args),
  deleteSelection: (...args: unknown[]) => deleteSelectionMock(...args),
  getSelectionCount: (...args: unknown[]) => getSelectionCountMock(...args),
  getLastRunStatuses: (...args: unknown[]) => getLastRunStatusesMock(...args),
}))

import { useDesignsStore } from '../stores/designs'

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

const design1 = { id: 'd1', user_id: 'u1', name: 'first', is_public: false, pattern: [0, 1, 2, 3, 4, 0, 0] }
const selection1 = {
  id: 's1',
  user_id: 'u1',
  design_id: 'd1',
  is_active: true,
  start_date: '2025-01-05',
  year: 2025,
  custom_range: false,
  repeat_indefinitely: false,
  recurrence_end_date: null,
}
const joinedRow1 = {
  ...selection1,
  name: design1.name,
  is_public: design1.is_public,
  pattern: design1.pattern,
  design_owner_id: design1.user_id,
}
const joinedRow2 = { ...joinedRow1, id: 's2', design_id: 'd2', name: 'second', is_active: false }

describe('designs store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    createDesignMock.mockReset()
    listSelectionsMock.mockReset()
    getDesignMock.mockReset()
    updateDesignMock.mockReset()
    selectDesignMock.mockReset()
    updateSelectionMock.mockReset()
    deleteSelectionMock.mockReset()
    getSelectionCountMock.mockReset()
    getLastRunStatusesMock.mockReset()
  })

  it('fetchSelections populates selections from the API response', async () => {
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [joinedRow1, joinedRow2] }))

    const store = useDesignsStore()
    await store.fetchSelections()

    expect(store.selections).toEqual([joinedRow1, joinedRow2])
    expect(store.isLoading).toBe(false)
  })

  it('fetchSelections clears the list on a failed response', async () => {
    listSelectionsMock.mockResolvedValue(jsonResponse({}, false))

    const store = useDesignsStore()
    store.selections = [joinedRow1]
    await store.fetchSelections()

    expect(store.selections).toEqual([])
  })

  it('createDesign prepends a joined row (built from the design + selection response) to the list', async () => {
    createDesignMock.mockResolvedValue(jsonResponse({ data: [{ design: design1, selection: selection1 }] }))

    const store = useDesignsStore()
    const result = await store.createDesign({ start_date: '2025-01-05', year: 2025, pattern: design1.pattern })

    expect(result).toEqual({ design: design1, selection: selection1 })
    expect(store.selections).toEqual([joinedRow1])
  })

  it('createDesign returns null and leaves the list untouched on failure', async () => {
    createDesignMock.mockResolvedValue(jsonResponse({}, false))

    const store = useDesignsStore()
    const result = await store.createDesign({ start_date: '2025-01-05', year: 2025, pattern: design1.pattern })

    expect(result).toBeNull()
    expect(store.selections).toEqual([])
  })

  it('updateDesignContent updates content fields on the matching row without touching its selection fields', async () => {
    const updatedDesign = { ...design1, name: 'renamed' }
    updateDesignMock.mockResolvedValue(jsonResponse({ data: [updatedDesign] }))

    const store = useDesignsStore()
    store.selections = [joinedRow1, joinedRow2]
    const result = await store.updateDesignContent('d1', { name: 'renamed' })

    expect(result).toEqual(updatedDesign)
    expect(store.selections[0]!.name).toBe('renamed')
    expect(store.selections[0]!.is_active).toBe(true) // untouched
    expect(store.selections[1]).toEqual(joinedRow2)
  })

  it('updateSelectionSchedule updates schedule fields on the matching row without touching content fields', async () => {
    const updatedSelection = { ...selection1, year: 2024, start_date: '2024-02-04', custom_range: true }
    updateSelectionMock.mockResolvedValue(jsonResponse({ data: [updatedSelection] }))

    const store = useDesignsStore()
    store.selections = [joinedRow1]
    const result = await store.updateSelectionSchedule('d1', { year: 2024, start_date: '2024-02-04', custom_range: true })

    expect(result).toEqual(updatedSelection)
    expect(store.selections[0]!.year).toBe(2024)
    expect(store.selections[0]!.start_date).toBe('2024-02-04')
    expect(store.selections[0]!.custom_range).toBe(true)
    expect(store.selections[0]!.name).toBe(joinedRow1.name) // content untouched
  })

  it('updateSelectionSchedule returns null and leaves the list untouched on failure', async () => {
    updateSelectionMock.mockResolvedValue(jsonResponse({}, false))

    const store = useDesignsStore()
    store.selections = [joinedRow1]
    const result = await store.updateSelectionSchedule('d1', { start_date: '2025-02-02' })

    expect(result).toBeNull()
    expect(store.selections).toEqual([joinedRow1])
  })

  it('removeSelection removes the matching row on success', async () => {
    deleteSelectionMock.mockResolvedValue(jsonResponse({}))

    const store = useDesignsStore()
    store.selections = [joinedRow1, joinedRow2]
    const result = await store.removeSelection('d1')

    expect(result).toEqual({ ok: true })
    expect(store.selections).toEqual([joinedRow2])
  })

  it("removeSelection leaves the list untouched on failure, passing on the server's message", async () => {
    deleteSelectionMock.mockResolvedValue(jsonResponse({ error: 'This design is being painted.' }, false))

    const store = useDesignsStore()
    store.selections = [joinedRow1]
    const result = await store.removeSelection('d1')

    expect(result).toEqual({ ok: false, error: 'This design is being painted.' })
    expect(store.selections).toEqual([joinedRow1])
  })

})
