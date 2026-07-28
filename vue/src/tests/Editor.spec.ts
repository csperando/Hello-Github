import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import EditorView from '../views/Editor.vue'
import CustomRangeSlider from '../components/ui/CustomRangeSlider.vue'

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
  updateProfile: vi.fn(),
}))

const createDesignMock = vi.fn()
const getDesignMock = vi.fn()
const updateDesignMock = vi.fn()

vi.mock('@/services/designs', () => ({
  createDesign: (...args: unknown[]) => createDesignMock(...args),
  listDesigns: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
  getDesign: (...args: unknown[]) => getDesignMock(...args),
  updateDesign: (...args: unknown[]) => updateDesignMock(...args),
  deleteDesign: vi.fn(),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

async function mountEditor(initialPath = '/editor') {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/editor/:designId?', component: EditorView }],
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

describe('Editor.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-07T12:00:00Z')) // a Wednesday; todayAnchor -> 2026-01-04
    createDesignMock.mockReset()
    getDesignMock.mockReset()
    updateDesignMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves a bounding-box-trimmed pattern when custom range is off', async () => {
    createDesignMock.mockResolvedValue(jsonResponse({ data: [{ id: 'new-id' }] }))

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
    createDesignMock.mockResolvedValue(jsonResponse({ data: [{ id: 'new-id' }] }))

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

  it('loads an existing design from the route param and reconstructs editor state', async () => {
    getDesignMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'd1',
            user_id: 'u1',
            name: 'Loaded Design',
            is_public: true,
            start_date: '2026-01-04',
            end_date: '2026-01-10',
            pattern: [0, 1, 2, 3, 4, 0, 0],
            repeat_indefinitely: false,
            recurrence_end_date: null,
          },
        ],
      }),
    )

    const { wrapper } = await mountEditor('/editor/d1')

    expect(getDesignMock).toHaveBeenCalledWith('d1')

    const nameInput = wrapper.find('input[placeholder="untitled design"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('Loaded Design')

    // pattern (7 cells) is narrower than the full grid, so it's reconstructed as a custom range
    expect(wrapper.findComponent(CustomRangeSlider).exists()).toBe(true)

    const saveButton = wrapper.findAll('button').find((b) => b.text().includes('save changes'))
    expect(saveButton).toBeTruthy()
  })
})
