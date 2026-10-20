import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import EditorView from '../views/Editor.vue'
import CustomRangeSlider from '../components/ui/CustomRangeSlider.vue'
import { useAuthStore } from '@/stores/auth'
import { getPatternIndexForDate, type iScheduleFields } from '@/helpers/grid'

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

type EditorWrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']

function cellOn(wrapper: EditorWrapper, date: string) {
  return wrapper.get(`[data-testid="grid-cell"][data-date="${date}"]`)
}

async function paint(wrapper: EditorWrapper, ...dates: string[]) {
  for (const date of dates) await cellOn(wrapper, date).trigger('mousedown')
}

/** Every date of `year` as YYYY-MM-DD. */
function datesOfYear(year: number): string[] {
  const dates: string[] = []
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/**
 * The dates of `year` the backfill would paint for a saved payload - run
 * through getPatternIndexForDate, the editor's mirror of the API's scheduler.
 */
function backfilledDates(payload: { pattern: number[] } & iScheduleFields & { year: number }): string[] {
  return datesOfYear(payload.year).filter((date) => {
    const idx = getPatternIndexForDate(payload.pattern, payload, date)
    return idx != null && (payload.pattern[idx] ?? 0) > 0
  })
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
  start_date: '2025-03-02', // a Sunday, 9 columns into 2025's grid
  year: 2025,
  custom_range: false,
  repeat_indefinitely: false,
  recurrence_end_date: null,
  name: loadedDesignContent.name,
  is_public: loadedDesignContent.is_public,
  pattern: loadedDesignContent.pattern,
}

describe('Editor.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-07T12:00:00Z')) // default year 2025 -> yearAnchor 2024-12-29
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

  // templates + brush intensity panels are commented out in Editor.vue for now
  it.skip('renders templates and brush swatches as real, keyboard-operable buttons', async () => {
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

    await paint(wrapper, '2025-01-13', '2025-01-15') // Mon + Wed of the 3rd column

    await findButton(wrapper, 'save as draft').trigger('click')
    await flushPromises()

    expect(createDesignMock).toHaveBeenCalledTimes(1)
    const payload = createDesignMock.mock.calls[0]![0]
    expect(payload.start_date).toBe('2025-01-12') // that column's Sunday
    expect(payload.pattern).toEqual([0, 1, 0, 1, 0, 0, 0])
    expect(payload.year).toBe(2025)
    expect(payload.custom_range).toBe(false)
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

    // Tue Feb 25 (column 8) is outside the default range (columns 0-6) - it
    // should write through to its source cell inside the range, Tue Jan 7 (column 1)
    await paint(wrapper, '2025-02-25')
    expect(cellOn(wrapper, '2025-01-07').attributes('data-level')).toBe('1')

    await findButton(wrapper, 'save as draft').trigger('click')
    await flushPromises()

    expect(createDesignMock).toHaveBeenCalledTimes(1)
    const payload = createDesignMock.mock.calls[0]![0]
    expect(payload.start_date).toBe('2024-12-29') // column 0's Sunday - the API reads its year a week later, as 2025
    expect(payload.pattern).toHaveLength(49) // 7 weeks
    expect(payload.pattern[1 * 7 + 2]).toBe(1)
    expect(payload.pattern.filter((v: number) => v > 0)).toHaveLength(1)
    // custom_range alone says it tiles through the end of the year - the
    // reserved recurrence fields stay unset
    expect(payload.year).toBe(2025)
    expect(payload.custom_range).toBe(true)
    expect(payload.repeat_indefinitely).toBe(false)
    expect(payload.recurrence_end_date).toBeNull()
  })

  it('offers the last 10 full years, defaulting to the most recent, with no Today tab', async () => {
    const { wrapper } = await mountEditor('/editor')

    const select = wrapper.get('select#editor-year')
    const options = select.findAll('option').map((o) => o.text())
    expect(options).toHaveLength(10)
    expect(options[0]).toBe('2025')
    expect(options[9]).toBe('2016')
    expect((select.element as HTMLSelectElement).value).toBe('2025')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Today')).toBe(false)
    expect(wrapper.text()).toContain('starts Jan 1, 2025')
  })

  it('re-anchors the grid on the chosen year and saves against it', async () => {
    createDesignMock.mockResolvedValue(
      jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }),
    )

    const { wrapper } = await mountEditor('/editor')

    await wrapper.get('select#editor-year').setValue('2023')
    expect(wrapper.text()).toContain('starts Jan 1, 2023')

    // nothing was painted before switching, so this is the only painted cell
    await paint(wrapper, '2023-01-23') // Mon of the 4th column

    await findButton(wrapper, 'save as draft').trigger('click')
    await flushPromises()

    const payload = createDesignMock.mock.calls[0]![0]
    expect(payload.start_date).toBe('2023-01-22') // anchor (2023-01-01) + 3 weeks
    expect(payload.pattern).toEqual([0, 1, 0, 0, 0, 0, 0])
  })

  it('hides "repeat every year" and replaces the custom-range duration controls with the year end', async () => {
    const { wrapper } = await mountEditor('/editor')

    expect(wrapper.text()).not.toContain('repeat every year')

    await findClickableDiv(wrapper, 'select custom range').find('button').trigger('click')

    expect(wrapper.findAll('button').some((b) => b.text() === 'indefinitely')).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === 'end date')).toBe(false)
    expect(wrapper.text()).toContain('repeats through Dec 31, 2025')
  })

  it('selects the year of a loaded past-year design', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
    listSelectionsMock.mockResolvedValue(
      jsonResponse({ data: [{ ...loadedSelectionRow, start_date: '2023-01-01', year: 2023, custom_range: true }] }),
    )

    const { wrapper } = await mountEditor('/editor/d1')

    expect((wrapper.get('select#editor-year').element as HTMLSelectElement).value).toBe('2023')
    expect(wrapper.text()).toContain('starts Jan 1, 2023')
  })

  it('loads an existing design from the route param, joined with the caller\'s own selection', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))

    const { wrapper } = await mountEditor('/editor/d1')

    expect(getDesignMock).toHaveBeenCalledWith('d1')

    const nameInput = wrapper.find('input[placeholder="untitled design"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('Loaded Design')

    // a one-off stays a one-off, however narrow its pattern
    expect(wrapper.findComponent(CustomRangeSlider).exists()).toBe(false)

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
      expect.objectContaining({ start_date: '2025-03-02' }),
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

  describe('year grid', () => {
    function monthLabels(wrapper: EditorWrapper) {
      return wrapper.findAll('.month-label').map((l) => ({ text: l.text(), col: l.attributes('style') }))
    }

    it('labels exactly jan-dec, with jan over the first column even when it starts in December', async () => {
      const { wrapper } = await mountEditor('/editor') // 2025: column 1 starts Sun Dec 29, 2024

      const labels = monthLabels(wrapper)
      expect(labels.map((l) => l.text)).toEqual(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])
      expect(labels[0]!.col).toContain('grid-column: 1 / span 4')
    })

    it('shows out-of-year days but does not let them be painted', async () => {
      const { wrapper } = await mountEditor('/editor')
      const group = () => wrapper.get('[role="group"]').attributes('aria-label')

      for (const date of ['2024-12-29', '2024-12-30', '2024-12-31', '2026-01-01', '2026-01-02', '2026-01-03']) {
        const cell = cellOn(wrapper, date)
        expect(cell.attributes('data-outside-year')).toBeDefined()
        expect(cell.attributes('title')).toBeUndefined()
        await cell.trigger('mousedown')
        expect(cellOn(wrapper, date).attributes('data-level')).toBe('0')
      }
      expect(group()).toBe('contribution graph editor, 0 of 365 squares painted')

      await paint(wrapper, '2025-01-01', '2025-12-31')
      expect(group()).toBe('contribution graph editor, 2 of 365 squares painted')
    })

    it('never randomizes paint onto out-of-year days', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // every cell "wins" the coin flip
      const { wrapper } = await mountEditor('/editor')

      await findButton(wrapper, 'randomize noise').trigger('click')

      expect(cellOn(wrapper, '2024-12-31').attributes('data-level')).toBe('0')
      expect(cellOn(wrapper, '2026-01-01').attributes('data-level')).toBe('0')
      expect(wrapper.get('[role="group"]').attributes('aria-label')).toContain('365 of 365')
      vi.mocked(Math.random).mockRestore()
    })

    it('a ghost cell whose custom-range source is out of year cannot be painted', async () => {
      const { wrapper } = await mountEditor('/editor')
      await findButton(wrapper, 'clear grid').trigger('click')
      await findClickableDiv(wrapper, 'select custom range').find('button').trigger('click')

      // Sun Feb 16 (column 7) tiles back onto column 0's Sunday - Dec 29, 2024
      await paint(wrapper, '2025-02-16')

      expect(cellOn(wrapper, '2025-02-16').attributes('data-level')).toBe('0')
      expect(wrapper.get('[role="group"]').attributes('aria-label')).toContain('0 of 365')
    })

    it('backfills exactly the painted days - including Jan 1 and Dec 31', async () => {
      createDesignMock.mockResolvedValue(jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }))
      const { wrapper } = await mountEditor('/editor')
      await findButton(wrapper, 'clear grid').trigger('click')

      const painted = ['2025-01-01', '2025-01-04', '2025-06-15', '2025-12-28', '2025-12-31']
      await paint(wrapper, ...painted)
      await findButton(wrapper, 'save as draft').trigger('click')
      await flushPromises()

      expect(backfilledDates(createDesignMock.mock.calls[0]![0])).toEqual(painted)
    })

    it('backfills exactly what the custom-range preview shows', async () => {
      createDesignMock.mockResolvedValue(jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }))
      const { wrapper } = await mountEditor('/editor')
      await findButton(wrapper, 'clear grid').trigger('click')
      await findClickableDiv(wrapper, 'select custom range').find('button').trigger('click')

      await paint(wrapper, '2025-01-01', '2025-01-08', '2025-02-08')
      const previewed = wrapper
        .findAll('[data-testid="grid-cell"]')
        .filter((c) => c.attributes('data-level') !== '0')
        .map((c) => c.attributes('data-date')!)
        .sort()

      await findButton(wrapper, 'save as draft').trigger('click')
      await flushPromises()

      expect(backfilledDates(createDesignMock.mock.calls[0]![0])).toEqual(previewed)
    })

    it('reopens a saved mid-year design on the same dates it was saved with', async () => {
      getDesignMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedDesignContent, pattern: [0, 1, 0, 1, 0, 0, 0] }] }))
      listSelectionsMock.mockResolvedValue(
        jsonResponse({ data: [{ ...loadedSelectionRow, start_date: '2025-06-15' }] }),
      )
      updateDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
      updateSelectionMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))

      const { wrapper } = await mountEditor('/editor/d1')

      expect(wrapper.text()).toContain('starts Jan 1, 2025')
      expect(cellOn(wrapper, '2025-06-16').attributes('data-level')).toBe('1')
      expect(cellOn(wrapper, '2025-06-18').attributes('data-level')).toBe('1')
      expect(cellOn(wrapper, '2025-01-01').attributes('data-level')).toBe('0')

      await findButton(wrapper, 'save changes').trigger('click')
      await flushPromises()

      expect(updateDesignMock).toHaveBeenCalledWith('d1', expect.objectContaining({ pattern: [0, 1, 0, 1, 0, 0, 0] }))
      expect(updateSelectionMock).toHaveBeenCalledWith('d1', expect.objectContaining({ start_date: '2025-06-15' }))
    })

    describe('save -> reopen -> save round trip', () => {
      // Each loads a stored design, saves it untouched, and expects the exact
      // stored content + schedule back - nothing the editor shows on load may
      // come from anywhere but these fields.
      const week = (...days: number[]) => [0, 1, 2, 3, 4, 5, 6].map((d) => (days.includes(d) ? 1 : 0))
      const cases = [
        { label: 'a one-off mid-year', start_date: '2025-06-15', custom_range: false, pattern: [...week(1), ...week(), ...week(3)] },
        { label: "a one-off in the year's last column", start_date: '2025-12-28', custom_range: false, pattern: week(1, 3) },
        { label: 'a custom range from column 0', start_date: '2024-12-29', custom_range: true, pattern: [...week(3), ...week()] },
        { label: 'a custom range mid-year', start_date: '2025-03-02', custom_range: true, pattern: [...week(), ...week(2), ...week()] },
        { label: "a custom range ending in the year's last column", start_date: '2025-12-14', custom_range: true, pattern: [...week(1), ...week(), ...week(2)] },
      ]

      it.each(cases)('$label', async ({ start_date, custom_range, pattern }) => {
        const stored = { ...loadedSelectionRow, start_date, custom_range, year: 2025, pattern }
        getDesignMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedDesignContent, pattern }] }))
        listSelectionsMock.mockResolvedValue(jsonResponse({ data: [stored] }))
        updateDesignMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedDesignContent, pattern }] }))
        updateSelectionMock.mockResolvedValue(jsonResponse({ data: [stored] }))

        const { wrapper } = await mountEditor('/editor/d1')
        expect(wrapper.findComponent(CustomRangeSlider).exists()).toBe(custom_range)

        await findButton(wrapper, 'save changes').trigger('click')
        await flushPromises()

        expect(updateDesignMock.mock.calls[0]![1].pattern).toEqual(pattern)
        expect(updateSelectionMock.mock.calls[0]![1]).toEqual({
          year: 2025,
          start_date,
          custom_range,
          repeat_indefinitely: false,
          recurrence_end_date: null,
        })
      })

      it("loads a custom range's slider at its stored start column", async () => {
        getDesignMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedDesignContent, pattern: new Array(21).fill(0) }] }))
        listSelectionsMock.mockResolvedValue(
          jsonResponse({ data: [{ ...loadedSelectionRow, start_date: '2025-03-02', custom_range: true }] }),
        )

        const { wrapper } = await mountEditor('/editor/d1')

        const slider = wrapper.findComponent(CustomRangeSlider)
        expect(slider.props('start')).toBe(9) // Sun 2025-03-02 is column 9 of 2025's grid
        expect(slider.props('end')).toBe(11) // 3 weeks wide
      })
    })

    describe('custom range starting mid-year', () => {
      async function mountWithRange(start: number, end: number) {
        createDesignMock.mockResolvedValue(jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }))
        const mounted = await mountEditor('/editor')
        await findButton(mounted.wrapper, 'clear grid').trigger('click')
        await findClickableDiv(mounted.wrapper, 'select custom range').find('button').trigger('click')
        const slider = mounted.wrapper.findComponent(CustomRangeSlider)
        slider.vm.$emit('update:end', end)
        slider.vm.$emit('update:start', start)
        await flushPromises()
        return mounted
      }

      it('shows nothing before the range, and those columns cannot be painted', async () => {
        const { wrapper } = await mountWithRange(9, 10) // Sun 2025-03-02 .. Sat 2025-03-15

        await paint(wrapper, '2025-03-03') // Mon in the range's first week
        await paint(wrapper, '2025-02-17') // Mon before the range - inert

        const before = wrapper
          .findAll('[data-testid="grid-cell"]')
          .filter((c) => c.attributes('data-date')! < '2025-03-02')
        expect(before.every((c) => c.attributes('data-level') === '0')).toBe(true)
        expect(cellOn(wrapper, '2025-02-17').classes()).toContain('grid-cell--disabled')
        expect(wrapper.get('[role="group"]').attributes('aria-label')).toContain('1 of 365')
      })

      it('dims every column outside the range on both sides, and moves with each handle', async () => {
        const { wrapper } = await mountWithRange(9, 10)
        // Mon of each column: 2024-12-30 is column 0, then +7 days per column
        const columnMonday = (col: number) => {
          const d = new Date(Date.UTC(2024, 11, 30 + col * 7))
          return d.toISOString().slice(0, 10)
        }
        const dimmedColumns = () =>
          [7, 8, 9, 10, 11, 12].filter((col) => cellOn(wrapper, columnMonday(col)).attributes('style')!.includes('opacity: 0.38'))

        expect(dimmedColumns()).toEqual([7, 8, 11, 12])

        const slider = wrapper.findComponent(CustomRangeSlider)
        slider.vm.$emit('update:start', 8)
        await flushPromises()
        expect(dimmedColumns()).toEqual([7, 11, 12])

        slider.vm.$emit('update:end', 11)
        await flushPromises()
        expect(dimmedColumns()).toEqual([7, 12])
      })

      it('backfills exactly what the preview shows', async () => {
        const { wrapper } = await mountWithRange(9, 10)
        await paint(wrapper, '2025-03-03', '2025-03-12')

        const previewed = wrapper
          .findAll('[data-testid="grid-cell"]')
          .filter((c) => c.attributes('data-level') !== '0')
          .map((c) => c.attributes('data-date')!)
          .sort()
        expect(previewed[0]).toBe('2025-03-03')
        expect(previewed[previewed.length - 1]).toBe('2025-12-31') // Wed of the last tiled week

        await findButton(wrapper, 'save as draft').trigger('click')
        await flushPromises()

        expect(backfilledDates(createDesignMock.mock.calls[0]![0])).toEqual(previewed)
      })
    })

    it("saves a design painted only in the year's last column against the selected year", async () => {
      createDesignMock.mockResolvedValue(jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }))
      const { wrapper } = await mountEditor('/editor')
      await findButton(wrapper, 'clear grid').trigger('click')

      // Sun 2025-12-28 starts both 2025's last column and 2026's first
      await paint(wrapper, '2025-12-29')
      await findButton(wrapper, 'save as draft').trigger('click')
      await flushPromises()

      const payload = createDesignMock.mock.calls[0]![0]
      expect(payload).toMatchObject({ year: 2025, start_date: '2025-12-28' })
      expect(backfilledDates(payload)).toEqual(['2025-12-29'])
    })

    describe('changing the year', () => {
      const dialog = (wrapper: EditorWrapper) => wrapper.find('[role="alertdialog"]')
      const yearSelect = (wrapper: EditorWrapper) => wrapper.get('select#editor-year')
      /** [index, level] of every painted cell - its position on the grid. */
      const paintedPositions = (wrapper: EditorWrapper) =>
        wrapper
          .findAll('[data-testid="grid-cell"]')
          .map((c, idx) => [idx, c.attributes('data-level')] as const)
          .filter(([, level]) => level !== '0')

      async function paintedEditor(...dates: string[]) {
        const mounted = await mountEditor('/editor')
        await findButton(mounted.wrapper, 'clear grid').trigger('click')
        await paint(mounted.wrapper, ...dates)
        return mounted
      }

      it('switches straight away, with no warning, when nothing is painted', async () => {
        const { wrapper } = await mountEditor('/editor')
        await findButton(wrapper, 'clear grid').trigger('click')

        await yearSelect(wrapper).setValue('2024')

        expect(dialog(wrapper).exists()).toBe(false)
        expect(wrapper.text()).toContain('starts Jan 1, 2024')
      })

      it('warns before switching once anything is painted', async () => {
        const { wrapper } = await paintedEditor('2025-06-16')

        await yearSelect(wrapper).setValue('2024')

        expect(dialog(wrapper).exists()).toBe(true)
        expect(dialog(wrapper).text()).toContain('switch to 2024?')
        expect(wrapper.text()).toContain('starts Jan 1, 2025') // not switched yet
      })

      it('cancelling keeps the year, the design, and the select on the current year', async () => {
        const { wrapper } = await paintedEditor('2025-06-16')
        const before = paintedPositions(wrapper)

        await yearSelect(wrapper).setValue('2024')
        await findButton(wrapper, 'keep editing').trigger('click')

        expect(dialog(wrapper).exists()).toBe(false)
        expect((yearSelect(wrapper).element as HTMLSelectElement).value).toBe('2025')
        expect(wrapper.text()).toContain('starts Jan 1, 2025')
        expect(paintedPositions(wrapper)).toEqual(before)
      })

      it('confirming copies the design onto the new year in the same columns and rows', async () => {
        const { wrapper } = await paintedEditor('2025-06-16', '2025-06-18', '2025-09-03')
        const before = paintedPositions(wrapper)

        await yearSelect(wrapper).setValue('2024')
        await findButton(wrapper, 'switch to 2024').trigger('click')

        expect(wrapper.text()).toContain('starts Jan 1, 2024')
        expect(paintedPositions(wrapper)).toEqual(before)
        // same square, new date underneath
        expect(cellOn(wrapper, '2024-06-17').attributes('data-level')).toBe('1')
      })

      it('drops squares that land outside the new year', async () => {
        // Wed Dec 31 2025 sits in 2025's last column; in 2024's grid that cell is Wed Jan 1 2025
        const { wrapper } = await paintedEditor('2025-12-31', '2025-06-16')

        await yearSelect(wrapper).setValue('2024')
        await findButton(wrapper, 'switch to 2024').trigger('click')

        expect(cellOn(wrapper, '2025-01-01').attributes('data-level')).toBe('0')
        expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('contribution graph editor, 1 of 366 squares painted')
      })

      it('keeps the custom range in place', async () => {
        const { wrapper } = await mountEditor('/editor')
        await findButton(wrapper, 'clear grid').trigger('click')
        await findClickableDiv(wrapper, 'select custom range').find('button').trigger('click')
        const slider = wrapper.findComponent(CustomRangeSlider)
        slider.vm.$emit('update:end', 12)
        slider.vm.$emit('update:start', 9)
        await flushPromises()
        await paint(wrapper, '2025-03-03')

        await yearSelect(wrapper).setValue('2024')
        await findButton(wrapper, 'switch to 2024').trigger('click')

        expect(wrapper.findComponent(CustomRangeSlider).props()).toMatchObject({ start: 9, end: 12 })
      })

      it('moves a saved design to the new year when saved, instead of creating a copy', async () => {
        getDesignMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedDesignContent, pattern: [0, 1, 0, 0, 0, 0, 0] }] }))
        listSelectionsMock.mockResolvedValue(jsonResponse({ data: [{ ...loadedSelectionRow, start_date: '2025-06-15' }] }))
        updateDesignMock.mockResolvedValue(jsonResponse({ data: [loadedDesignContent] }))
        updateSelectionMock.mockResolvedValue(jsonResponse({ data: [loadedSelectionRow] }))
        const { wrapper } = await mountEditor('/editor/d1')

        await yearSelect(wrapper).setValue('2024')
        await findButton(wrapper, 'switch to 2024').trigger('click')
        await findButton(wrapper, 'save changes').trigger('click')
        await flushPromises()

        expect(createDesignMock).not.toHaveBeenCalled()
        expect(updateDesignMock).toHaveBeenCalledWith('d1', expect.objectContaining({ pattern: [0, 1, 0, 0, 0, 0, 0] }))
        // column 24 of 2024's grid (starts Sun 2023-12-31) is Sun 2024-06-16
        expect(updateSelectionMock).toHaveBeenCalledWith('d1', expect.objectContaining({ year: 2024, start_date: '2024-06-16' }))
      })
    })

    describe('a leap year starting on a Saturday (2028)', () => {
      beforeEach(() => {
        vi.setSystemTime(new Date('2029-03-01T12:00:00Z')) // offers 2028 by default
      })

      it('renders 54 columns so Dec 31 is paintable, with 12 month labels', async () => {
        const { wrapper } = await mountEditor('/editor')

        expect(wrapper.findAll('[data-testid="grid-cell"]')).toHaveLength(54 * 7)
        expect(wrapper.get('.grid-inner').attributes('style')).toContain('--weeks: 54')
        expect(cellOn(wrapper, '2028-12-31').attributes('data-outside-year')).toBeUndefined()
        expect(monthLabels(wrapper)).toHaveLength(12)
        expect(wrapper.get('[role="group"]').attributes('aria-label')).toContain('of 366 squares')
      })

      it('backfills Jan 1 and Dec 31', async () => {
        createDesignMock.mockResolvedValue(jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }))
        const { wrapper } = await mountEditor('/editor')
        await findButton(wrapper, 'clear grid').trigger('click')

        await paint(wrapper, '2028-01-01', '2028-12-31')
        await findButton(wrapper, 'save as draft').trigger('click')
        await flushPromises()

        expect(backfilledDates(createDesignMock.mock.calls[0]![0])).toEqual(['2028-01-01', '2028-12-31'])
      })
    })
  })

  describe('continue to checkout', () => {
    async function paintAndContinue(wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper']) {
      await findButton(wrapper, 'clear grid').trigger('click')
      await paint(wrapper, '2025-01-13')
      await findButton(wrapper, 'continue to checkout').trigger('click')
      await flushPromises()
    }

    it('routes to /checkout carrying the saved design id and its year', async () => {
      createDesignMock.mockResolvedValue(
        jsonResponse({ data: [{ design: { id: 'new-id' }, selection: { id: 'sel-id' } }] }),
      )
      const { wrapper, router } = await mountEditor('/editor')

      await paintAndContinue(wrapper)

      expect(router.currentRoute.value.path).toBe('/checkout')
      expect(router.currentRoute.value.query.designId).toBe('new-id')
      expect(router.currentRoute.value.query.year).toBe('2025')
      expect(updateSelectionMock).not.toHaveBeenCalled()
    })

    // every purchase buys one design, so an unexpired paid_until no longer skips checkout
    it('routes a user with an unexpired paid_until to /checkout too', async () => {
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

      expect(updateSelectionMock).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/checkout')
    })
  })
})
