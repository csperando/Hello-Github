import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import EditorView from '../views/Editor.vue'
import CustomRangeSlider from '../components/ui/CustomRangeSlider.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
  updateProfile: vi.fn(),
}))

const createDesignMock = vi.fn()
const listSelectionsMock = vi.fn()
const getDesignMock = vi.fn()
const updateDesignMock = vi.fn()
const updateSelectionMock = vi.fn()
const getSelectionCountMock = vi.fn()

vi.mock('@/services/designs', () => ({
  createDesign: (...args: unknown[]) => createDesignMock(...args),
  listSelections: (...args: unknown[]) => listSelectionsMock(...args),
  getDesign: (...args: unknown[]) => getDesignMock(...args),
  updateDesign: (...args: unknown[]) => updateDesignMock(...args),
  selectDesign: vi.fn(),
  updateSelection: (...args: unknown[]) => updateSelectionMock(...args),
  deleteSelection: vi.fn(),
  getSelectionCount: (...args: unknown[]) => getSelectionCountMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

async function mountEditor(initialPath = '/editor') {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/editor/:designId?', component: EditorView },
      { path: '/checkout', name: 'Checkout', component: { template: '<div>checkout</div>' } },
      { path: '/dashboard', name: 'Dashboard', component: { template: '<div>dashboard</div>' } },
    ],
  })
  router.push(initialPath)
  await router.isReady()

  const wrapper = mount(EditorView, { global: { plugins: [pinia, router] } })
  await flushPromises()

  return { wrapper, router }
}

function findClickableDiv(wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'], text: string) {
  const el = wrapper.findAll('div').find((d) => d.text().startsWith(text))
  if (!el) throw new Error(`no div found starting with "${text}"`)
  return el
}

function findButton(wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'], text: string) {
  const el = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!el) throw new Error(`no button found containing "${text}"`)
  return el
}

const loadedDesignContent = {
  id: 'd1',
  user_id: 'u1',
  name: 'Loaded Design',
  is_public: true,
  pattern: [0, 1, 2, 3, 4, 0, 0],
}
const loadedSelectionRow = {
  id: 's1',
  user_id: 'u1',
  design_id: 'd1',
  design_owner_id: 'u1',
  is_active: true,
  start_date: '2026-01-04',
  repeat_indefinitely: false,
  recurrence_end_date: null,
  name: loadedDesignContent.name,
  is_public: loadedDesignContent.is_public,
  pattern: loadedDesignContent.pattern,
}

describe('Editor.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-07T12:00:00Z')) // a Wednesday; todayAnchor -> 2026-01-04
    createDesignMock.mockReset()
    listSelectionsMock.mockReset()
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [] }))
    getDesignMock.mockReset()
    updateDesignMock.mockReset()
    updateSelectionMock.mockReset()
    getSelectionCountMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives the paintable grid an accessible group name reflecting painted progress', async () => {
    const { wrapper } = await mountEditor('/editor')

    const group = wrapper.get('[role="group"]')
    expect(group.attributes('aria-label')).toMatch(/contribution graph editor, \d+ of \d+ squares painted/)
  })

  it('renders templates and brush swatches as real, keyboard-operable buttons', async () => {
    const { wrapper } = await mountEditor('/editor')

    const templateButton = findButton(wrapper, 'Blank canvas')
    expect(templateButton.attributes('type')).toBe('button')
    expect(templateButton.attributes('aria-pressed')).toBeDefined()

    const brushButtons = wrapper.findAll('button[aria-label^="intensity level"]')
    expect(brushButtons.length).toBeGreaterThan(0)
  })

  it('saves a bounding-box-trimmed pattern when custom range is off', async () => {
    createDesignMock.mockResolvedValue(
      jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }),
    )

    const { wrapper } = await mountEditor('/editor')

    await findButton(wrapper, 'clear grid').trigger('click')

    const cells = wrapper.findAll('[data-testid="grid-cell"]')
    // week 2, day 1 and week 2, day 3 -> idx 15 and 17
    await cells[15]!.trigger('mousedown')
    await cells[17]!.trigger('mousedown')

    await findButton(wrapper, 'save as draft').trigger('click')
    await flushPromises()

    expect(createDesignMock).toHaveBeenCalledTimes(1)
    const payload = createDesignMock.mock.calls[0]![0]
    expect(payload.start_date).toBe('2026-01-18') // anchor (01-04) + 2 weeks
    expect(payload.pattern).toEqual([0, 1, 0, 1, 0, 0, 0])
    expect(payload.repeat_indefinitely).toBe(false)
    expect(payload.recurrence_end_date).toBeNull()
  })

  it('uses the explicit custom range and maps ghost-cell paints back into it', async () => {
    createDesignMock.mockResolvedValue(
      jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }),
    )

    const { wrapper } = await mountEditor('/editor')

    await findButton(wrapper, 'clear grid').trigger('click')
    await findClickableDiv(wrapper, 'select custom range').find('button').trigger('click')

    expect(wrapper.findComponent(CustomRangeSlider).exists()).toBe(true)

    // week 8, day 2 is outside the default range (weeks 0-6) - should write
    // through to its mapped source cell inside the range (week 1, day 2)
    const cells = wrapper.findAll('[data-testid="grid-cell"]')
    await cells[8 * 7 + 2]!.trigger('mousedown')

    await findButton(wrapper, 'save as draft').trigger('click')
    await flushPromises()

    expect(createDesignMock).toHaveBeenCalledTimes(1)
    const payload = createDesignMock.mock.calls[0]![0]
    expect(payload.start_date).toBe('2026-01-04') // anchor + 0 weeks (rangeStart)
    expect(payload.pattern).toHaveLength(49) // 7 weeks
    expect(payload.pattern[1 * 7 + 2]).toBe(1)
    expect(payload.pattern.filter((v: number) => v > 0)).toHaveLength(1)
    // custom range is active with the default "indefinitely" duration
    expect(payload.repeat_indefinitely).toBe(true)
    expect(payload.recurrence_end_date).toBeNull()
  })

  it('loads an existing design from the route param, joined with the caller\'s own selection', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))

    const { wrapper } = await mountEditor('/editor/d1')

    expect(getDesignMock).toHaveBeenCalledWith('d1')

    const nameInput = wrapper.find('input[placeholder="untitled design"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('Loaded Design')

    // pattern (7 cells) is narrower than the full grid, so it's reconstructed as a custom range
    expect(wrapper.findComponent(CustomRangeSlider).exists()).toBe(true)

    const saveButton = wrapper.findAll('button').find((b) => b.text().includes('save changes'))
    expect(saveButton).toBeTruthy()
  })

  it('saves content and schedule separately when updating an existing design', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))
    updateDesignMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedDesignContent, name: 'Renamed' }] }))
    updateSelectionMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))

    const { wrapper } = await mountEditor('/editor/d1')
    await wrapper.find('input[placeholder="untitled design"]').setValue('Renamed')

    await findButton(wrapper, 'save changes').trigger('click')
    await flushPromises()

    expect(updateDesignMock).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ name: 'Renamed', is_public: true }),
    )
    expect(updateSelectionMock).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ start_date: expect.any(String) }),
    )
  })

  it('warns before making a design private when other users have it active, and does not flip until confirmed', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))
    getSelectionCountMock.mockResolvedValue(jsonResponse({ data: [{ count: 3 }] }))

    const { wrapper } = await mountEditor('/editor/d1')

    const toggle = wrapper.get('[data-testid="visibility-toggle"]')
    expect(toggle.attributes('aria-checked')).toBe('true')
    await toggle.trigger('click')
    await flushPromises()

    expect(getSelectionCountMock).toHaveBeenCalledWith('d1')
    expect(wrapper.text()).toContain('3 other users have this design active')
    // still public - hasn't flipped yet, pending confirmation
    expect(wrapper.get('[data-testid="visibility-toggle"]').attributes('aria-checked')).toBe('true')

    await findButton(wrapper, 'make private').trigger('click')

    expect(wrapper.get('[data-testid="visibility-toggle"]').attributes('aria-checked')).toBe('false')
  })

  it('flips visibility immediately when no other users have the design active', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))
    getSelectionCountMock.mockResolvedValue(jsonResponse({ data: [{ count: 0 }] }))

    const { wrapper } = await mountEditor('/editor/d1')

    const toggle = wrapper.get('[data-testid="visibility-toggle"]')
    await toggle.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('other users have this design active')
    expect(wrapper.get('[data-testid="visibility-toggle"]').attributes('aria-checked')).toBe('false')
  })

  describe('continue to checkout', () => {
    async function paintAndContinue(wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper']) {
      await findButton(wrapper, 'clear grid').trigger('click')
      const cells = wrapper.findAll('[data-testid="grid-cell"]')
      await cells[15]!.trigger('mousedown')
      await findButton(wrapper, 'continue to checkout').trigger('click')
      await flushPromises()
    }

    it('routes an uncovered user to /checkout carrying the saved design id', async () => {
      createDesignMock.mockResolvedValue(
        jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }),
      )
      const { wrapper, router } = await mountEditor('/editor')

      await paintAndContinue(wrapper)

      expect(router.currentRoute.value.path).toBe('/checkout')
      expect(router.currentRoute.value.query.designId).toBe('new-id')
      expect(updateSelectionMock).not.toHaveBeenCalled()
    })

    it('activates the selection directly and routes to /dashboard when the user is already covered', async () => {
      createDesignMock.mockResolvedValue(
        jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }),
      )
      updateSelectionMock.mockResolvedValue(jsonResponse({ data: [{ id: 'sel-id', is_active: true }] }))

      const { wrapper, router } = await mountEditor('/editor')
      useAuthStore().user = {
        id: 'u1',
        github_username: 'octo',
        paid_until: new Date(Date.now() + 86_400_000).toISOString(),
      }

      await paintAndContinue(wrapper)

      expect(updateSelectionMock).toHaveBeenCalledWith('new-id', { is_active: true })
      expect(router.currentRoute.value.path).toBe('/dashboard')
    })
  })
})
