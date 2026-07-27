import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const createDesignMock = vi.fn()
const listDesignsMock = vi.fn()
const getDesignMock = vi.fn()
const updateDesignMock = vi.fn()
const deleteDesignMock = vi.fn()

vi.mock('@/services/designs', () => ({
  createDesign: (...args: unknown[]) => createDesignMock(...args),
  listDesigns: (...args: unknown[]) => listDesignsMock(...args),
  getDesign: (...args: unknown[]) => getDesignMock(...args),
  updateDesign: (...args: unknown[]) => updateDesignMock(...args),
  deleteDesign: (...args: unknown[]) => deleteDesignMock(...args),
}))

import { useDesignsStore } from '../stores/designs'

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

const design1 = { id: 'd1', user_id: 'u1', name: 'first', is_public: false, start_date: '2026-01-04', end_date: '2026-01-10', pattern: [0, 1, 2, 3, 4, 0, 0], repeat_indefinitely: false }
const design2 = { id: 'd2', user_id: 'u1', name: 'second', is_public: true, start_date: '2026-01-04', end_date: '2026-01-10', pattern: [0, 0, 0, 0, 0, 0, 0], repeat_indefinitely: false }

describe('designs store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    createDesignMock.mockReset()
    listDesignsMock.mockReset()
    getDesignMock.mockReset()
    updateDesignMock.mockReset()
    deleteDesignMock.mockReset()
  })

  it('fetchDesigns populates designs from the API response', async () => {
    listDesignsMock.mockResolvedValue(jsonResponse({ data: [design1, design2] }))

    const store = useDesignsStore()
    await store.fetchDesigns()

    expect(store.designs).toEqual([design1, design2])
    expect(store.isLoading).toBe(false)
  })

  it('fetchDesigns clears the list on a failed response', async () => {
    listDesignsMock.mockResolvedValue(jsonResponse({}, false))

    const store = useDesignsStore()
    store.designs = [design1]
    await store.fetchDesigns()

    expect(store.designs).toEqual([])
  })

  it('createDesign prepends the created design to the list on success', async () => {
    createDesignMock.mockResolvedValue(jsonResponse({ data: [design1] }))

    const store = useDesignsStore()
    const result = await store.createDesign({ start_date: '2026-01-04', pattern: [0, 1, 2, 3, 4, 0, 0] })

    expect(result).toEqual(design1)
    expect(store.designs).toEqual([design1])
  })

  it('createDesign returns null and leaves the list untouched on failure', async () => {
    createDesignMock.mockResolvedValue(jsonResponse({}, false))

    const store = useDesignsStore()
    const result = await store.createDesign({ start_date: '2026-01-04', pattern: [0, 1, 2, 3, 4, 0, 0] })

    expect(result).toBeNull()
    expect(store.designs).toEqual([])
  })

  it('updateDesign replaces the matching entry in the list', async () => {
    const updated = { ...design1, name: 'renamed' }
    updateDesignMock.mockResolvedValue(jsonResponse({ data: [updated] }))

    const store = useDesignsStore()
    store.designs = [design1, design2]
    const result = await store.updateDesign('d1', { name: 'renamed' })

    expect(result).toEqual(updated)
    expect(store.designs).toEqual([updated, design2])
  })

  it('deleteDesign removes the design from the list on success', async () => {
    deleteDesignMock.mockResolvedValue(jsonResponse({}))

    const store = useDesignsStore()
    store.designs = [design1, design2]
    const ok = await store.deleteDesign('d1')

    expect(ok).toBe(true)
    expect(store.designs).toEqual([design2])
  })

  it('deleteDesign leaves the list untouched on failure', async () => {
    deleteDesignMock.mockResolvedValue(jsonResponse({}, false))

    const store = useDesignsStore()
    store.designs = [design1]
    const ok = await store.deleteDesign('d1')

    expect(ok).toBe(false)
    expect(store.designs).toEqual([design1])
  })
})
