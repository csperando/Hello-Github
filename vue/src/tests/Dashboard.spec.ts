import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import DashboardView from '../views/Dashboard.vue'
import { useAuthStore, type iAuthUser } from '../stores/auth'

const apiFetchMock = vi.fn()
const updateProfileMock = vi.fn()
const listSelectionsMock = vi.fn()
const updateSelectionMock = vi.fn()
const getLastRunStatusesMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}))

vi.mock('@/services/designs', () => ({
  listSelections: (...args: unknown[]) => listSelectionsMock(...args),
  createDesign: vi.fn(),
  getDesign: vi.fn(),
  updateDesign: vi.fn(),
  selectDesign: vi.fn(),
  updateSelection: (...args: unknown[]) => updateSelectionMock(...args),
  deleteSelection: vi.fn(),
  getSelectionCount: vi.fn(),
  getLastRunStatuses: (...args: unknown[]) => getLastRunStatusesMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

function buildUser(overrides: Partial<iAuthUser> = {}): iAuthUser {
  return {
    id: 'u1',
    github_username: 'lena',
    avatar_url: 'https://avatars.example/lena.png',
    display_name: 'Lena Ortiz',
    default_charity: 'EFF',
    public_opt_in: true,
    role: 'user',
    is_active: true,
    ...overrides,
  }
}

function buildSelection(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    user_id: 'u1',
    design_id: 'd1',
    design_owner_id: 'u1',
    is_active: false,
    is_public: false,
    name: 'My Heart',
    pattern: [0, 1, 2, 3, 4, 0, 0],
    start_date: '2026-01-04',
    repeat_indefinitely: false,
    recurrence_end_date: null,
    ...overrides,
  }
}

async function mountDashboard(user: iAuthUser | null) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = user
  authStore.isLoading = false

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/dashboard', component: DashboardView },
      { path: '/editor', component: { template: '<div>editor</div>' } },
      { path: '/editor/:designId', component: { template: '<div>editor</div>' } },
      { path: '/settings', component: { template: '<div>settings</div>' } },
    ],
  })
  router.push('/dashboard')
  await router.isReady()

  const wrapper = mount(DashboardView, { global: { plugins: [pinia, router] } })
  await flushPromises()

  return { wrapper, authStore }
}

describe('Dashboard.vue', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    updateProfileMock.mockReset()
    listSelectionsMock.mockReset()
    updateSelectionMock.mockReset()
    getLastRunStatusesMock.mockReset()
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [] }))
    getLastRunStatusesMock.mockResolvedValue(jsonResponse({ data: [] }))
  })

  it('stacks the stats row and main/sidebar split to a single column on narrow viewports', async () => {
    const { wrapper } = await mountDashboard(buildUser())

    const gridDivs = wrapper.findAll('div.grid')
    expect(gridDivs.some((d) => d.classes().includes('grid-cols-1') && d.classes().includes('sm:grid-cols-2'))).toBe(true)
    expect(gridDivs.some((d) => d.classes().includes('grid-cols-1') && d.classes().some((c) => c.startsWith('lg:grid-cols-')))).toBe(true)
  })

  it('renders the authenticated user\'s real name in the header', async () => {
    const { wrapper } = await mountDashboard(buildUser({ display_name: 'Lena Ortiz' }))

    expect(wrapper.find('h1').text()).toBe('Lena Ortiz')
  })

  it('falls back to the github username when no display name is set', async () => {
    const { wrapper } = await mountDashboard(
      buildUser({ display_name: undefined, name: undefined, github_username: 'lena' }),
    )

    expect(wrapper.find('h1').text()).toBe('lena')
  })

  it('reflects the user\'s real default charity and public-opt-in state', async () => {
    const { wrapper } = await mountDashboard(buildUser({ default_charity: 'EFF', public_opt_in: false }))

    expect(wrapper.text()).toContain('EFF')
    expect(wrapper.text()).not.toContain('GiveDirectly')
  })

  it('shows an honest placeholder when no default charity is set', async () => {
    const { wrapper } = await mountDashboard(buildUser({ default_charity: undefined }))

    expect(wrapper.text()).toContain('no charity selected')
  })

  it('persists the public-opt-in toggle via updateProfile', async () => {
    updateProfileMock.mockResolvedValue({ ok: true })
    const { wrapper, authStore } = await mountDashboard(buildUser({ id: 'u1', public_opt_in: true }))

    const toggle = wrapper.find('[data-testid="public-opt-in-toggle"]')
    await toggle.trigger('click')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalledWith('u1', { public_opt_in: false })
    expect(authStore.user?.public_opt_in).toBe(false)
  })

  it('reverts the public-opt-in toggle if the save fails', async () => {
    updateProfileMock.mockResolvedValue({ ok: false })
    const { wrapper, authStore } = await mountDashboard(buildUser({ id: 'u1', public_opt_in: true }))

    const toggle = wrapper.find('[data-testid="public-opt-in-toggle"]')
    await toggle.trigger('click')
    await flushPromises()

    expect(authStore.user?.public_opt_in).toBe(true)
  })

  it('shows an empty state for designs and receipts when there is no real data', async () => {
    const { wrapper } = await mountDashboard(buildUser())

    expect(wrapper.text()).toContain('no designs yet')
    expect(wrapper.text()).toContain('no receipts yet')
    expect(wrapper.text()).not.toContain('total donated')
    expect(wrapper.text()).not.toContain('charities supported')
  })

  it('lists authored and adopted selections together, from the joined GET /design response', async () => {
    listSelectionsMock.mockResolvedValue(
      jsonResponse({
        data: [
          buildSelection({ design_id: 'd1', name: 'My Heart', design_owner_id: 'u1' }),
          buildSelection({ design_id: 'd2', name: "Someone Else's Smiley", design_owner_id: 'u2', is_public: true }),
        ],
      }),
    )

    const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

    expect(wrapper.text()).toContain('My Heart')
    expect(wrapper.text()).toContain("Someone Else's Smiley")
  })

  it('only counts designs the user actually authored in the stat cards, not adopted ones', async () => {
    listSelectionsMock.mockResolvedValue(
      jsonResponse({
        data: [
          buildSelection({ design_id: 'd1', design_owner_id: 'u1', is_public: true }),
          buildSelection({ design_id: 'd2', design_owner_id: 'u2', is_public: true }),
        ],
      }),
    )

    const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('designs created')
  })

  it('shows "no longer available" for an adopted design that has since gone private', async () => {
    listSelectionsMock.mockResolvedValue(
      jsonResponse({
        data: [buildSelection({ design_id: 'd2', name: 'Private Now', design_owner_id: 'u2', is_public: false })],
      }),
    )

    const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

    expect(wrapper.text()).toContain('no longer available')
    expect(wrapper.text()).not.toContain('Private Now')
  })

  it('still shows full details for the viewer\'s own private design', async () => {
    listSelectionsMock.mockResolvedValue(
      jsonResponse({
        data: [buildSelection({ design_id: 'd1', name: 'My Private Heart', design_owner_id: 'u1', is_public: false })],
      }),
    )

    const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

    expect(wrapper.text()).toContain('My Private Heart')
    expect(wrapper.text()).not.toContain('no longer available')
  })

  it('toggles a design active via the active toggle', async () => {
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection({ is_active: false })] }))
    updateSelectionMock.mockResolvedValue(jsonResponse({ data: [{ is_active: true }] }))

    const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

    const toggle = wrapper.get('[data-testid="active-toggle-d1"]')
    expect(toggle.attributes('aria-checked')).toBe('false')

    await toggle.trigger('click')
    await flushPromises()

    expect(updateSelectionMock).toHaveBeenCalledWith('d1', { is_active: true })
    expect(wrapper.get('[data-testid="active-toggle-d1"]').attributes('aria-checked')).toBe('true')
  })

  it('rolls back the active toggle and shows the server error on a one-active-per-user conflict', async () => {
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection({ is_active: false })] }))
    updateSelectionMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'You already have another design active.' }, false),
    )

    const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

    await wrapper.get('[data-testid="active-toggle-d1"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="active-toggle-d1"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('You already have another design active.')
  })

  describe('last-run status', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-04T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows a relative "last painted" label for a committed run', async () => {
      listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection()] }))
      getLastRunStatusesMock.mockResolvedValue(
        jsonResponse({
          data: [
            {
              design_id: 'd1',
              target_date: '2026-01-04',
              commit_count: 5,
              status: 'committed',
              created_at: '2026-01-04T10:00:00Z',
            },
          ],
        }),
      )

      const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

      expect(wrapper.text()).toContain('last painted 2 hours ago')
    })

    it('shows a failed-attempt label instead of a relative time when the last run failed', async () => {
      listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection()] }))
      getLastRunStatusesMock.mockResolvedValue(
        jsonResponse({
          data: [
            {
              design_id: 'd1',
              target_date: '2026-01-04',
              commit_count: 0,
              status: 'failed',
              created_at: '2026-01-04T10:00:00Z',
            },
          ],
        }),
      )

      const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

      expect(wrapper.text()).toContain('last attempt failed')
    })

    it('shows no run-status label for a design that has never run', async () => {
      listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection()] }))
      getLastRunStatusesMock.mockResolvedValue(jsonResponse({ data: [] }))

      const { wrapper } = await mountDashboard(buildUser({ id: 'u1' }))

      expect(wrapper.text()).not.toContain('last painted')
      expect(wrapper.text()).not.toContain('last attempt failed')
    })
  })
})
