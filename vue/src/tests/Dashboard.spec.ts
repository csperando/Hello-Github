import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import DashboardView from '../views/Dashboard.vue'
import { useAuthStore, type iAuthUser } from '../stores/auth'

const apiFetchMock = vi.fn()
const getOrgByIdMock = vi.fn()
const listSelectionsMock = vi.fn()
const listPaymentsMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  getOrgById: (...args: unknown[]) => getOrgByIdMock(...args),
}))

vi.mock('@/services/payments', () => ({
  listPayments: (...args: unknown[]) => listPaymentsMock(...args),
}))

const getPaintStatusesMock = vi.fn()
vi.mock('@/services/designs', () => ({
  listSelections: (...args: unknown[]) => listSelectionsMock(...args),
  createDesign: vi.fn(),
  getDesign: vi.fn(),
  updateDesign: vi.fn(),
  selectDesign: vi.fn(),
  updateSelection: vi.fn(),
  deleteSelection: vi.fn(),
  getSelectionCount: vi.fn(),
  getPaintStatuses: (...args: unknown[]) => getPaintStatusesMock(...args),
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
    default_charity: 42,
    public_opt_in: true,
    role: 'user',
    is_active: true,
    ...overrides,
  }
}

/** A GET /payments row. */
function payment(amountTotalCents: number, status = 'succeeded', amountRefundedCents = 0) {
  return {
    id: `p${amountTotalCents}`,
    kind: 'one_time',
    status,
    amount_total_cents: amountTotalCents,
    amount_platform_cents: 100,
    amount_charity_cents: amountTotalCents - 100,
    amount_refunded_cents: amountRefundedCents,
    refunded_at: amountRefundedCents ? '2026-10-02T00:00:00.000Z' : null,
    charity_ein_id: 42,
    created_at: '2026-10-01T00:00:00.000Z',
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
    start_date: '2025-01-05',
    year: 2025,
    custom_range: false,
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

/** The value shown on the stat card with the given label. */
function statCard(wrapper: Awaited<ReturnType<typeof mountDashboard>>['wrapper'], label: string): string {
  const card = wrapper.findAll('.stat-card').find((c) => c.get('.stat-label').text() === label)
  if (!card) throw new Error(`no stat card labelled "${label}"`)
  return card.get('.stat-value').text()
}

describe('Dashboard.vue', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    getOrgByIdMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
    listPaymentsMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
    listSelectionsMock.mockReset()
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [] }))
    getPaintStatusesMock.mockReset().mockResolvedValue(
      jsonResponse({
        data: [
          { code: 'unpainted', label: 'not painted', description: '' },
          { code: 'locked', label: 'painting', description: '' },
          { code: 'painted', label: 'painted', description: '' },
          { code: 'error', label: 'paint failed', description: '' },
        ],
      }),
    )
  })

  it.each([
    ['unpainted', 'not painted'],
    ['locked', 'painting'],
    ['painted', 'painted'],
    ['error', 'paint failed'],
  ])("labels a %s design with its defined wording", async (code, label) => {
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection({ paint_status: code })] }))

    const { wrapper } = await mountDashboard(buildUser())

    expect(wrapper.get('[data-testid="paint-status-d1"]').text()).toBe(label)
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

  it('shows an empty state for designs when there is no real data', async () => {
    const { wrapper } = await mountDashboard(buildUser())

    expect(wrapper.text()).toContain('no designs yet')
    expect(wrapper.text()).not.toContain('no receipts yet')
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

  describe('contributed total', () => {
    it('adds up the full amount of every payment, matching what the user was charged', async () => {
      // succeeded = one-time checkout, paid = subscription invoice
      listPaymentsMock.mockResolvedValue(jsonResponse({ data: [payment(1000), payment(2550, 'paid')] }))

      const { wrapper } = await mountDashboard(buildUser())

      expect(statCard(wrapper, 'contributed')).toBe('$35.50')
    })

    it('takes off anything refunded', async () => {
      listPaymentsMock.mockResolvedValue(jsonResponse({ data: [payment(2500, 'succeeded', 2500), payment(1000, 'succeeded', 400)] }))

      const { wrapper } = await mountDashboard(buildUser())

      expect(statCard(wrapper, 'contributed')).toBe('$6.00')
    })

    it('ignores payments that never went through', async () => {
      listPaymentsMock.mockResolvedValue(jsonResponse({ data: [payment(1000), payment(5000, 'failed')] }))

      const { wrapper } = await mountDashboard(buildUser())

      expect(statCard(wrapper, 'contributed')).toBe('$10.00')
    })

    it('reads $0.00 with no payments, or when they fail to load', async () => {
      const { wrapper } = await mountDashboard(buildUser())
      expect(statCard(wrapper, 'contributed')).toBe('$0.00')

      listPaymentsMock.mockResolvedValue(jsonResponse({}, false))
      const { wrapper: failed } = await mountDashboard(buildUser())
      expect(statCard(failed, 'contributed')).toBe('$0.00')
    })

    it('replaces the old "public" stat', async () => {
      const { wrapper } = await mountDashboard(buildUser())

      expect(wrapper.text()).not.toContain('on your profile now')
    })
  })

  describe('default charity', () => {
    it("names the user's selected charity", async () => {
      getOrgByIdMock.mockResolvedValue(jsonResponse({ data: { id: 42, name: 'GiveDirectly' } }))

      const { wrapper } = await mountDashboard(buildUser({ default_charity: 42 }))

      expect(getOrgByIdMock).toHaveBeenCalledWith(42)
      expect(wrapper.get('[data-testid="default-charity"]').text()).toBe('GiveDirectly')
    })

    it('says so when none is selected, without looking anything up', async () => {
      const { wrapper } = await mountDashboard(buildUser({ default_charity: undefined }))

      expect(getOrgByIdMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="default-charity"]').text()).toBe('no charity selected')
    })

    it('falls back to "charity selected" if the name can\'t be loaded', async () => {
      getOrgByIdMock.mockResolvedValue(jsonResponse({}, false))

      const { wrapper } = await mountDashboard(buildUser({ default_charity: 42 }))

      expect(wrapper.get('[data-testid="default-charity"]').text()).toBe('charity selected')
    })
  })

  it('no longer shows the daily-painting leftovers: active toggle, plans, sharing default, public badge, last painted', async () => {
    listSelectionsMock.mockResolvedValue(jsonResponse({ data: [buildSelection({ is_active: true, is_public: true })] }))

    const { wrapper } = await mountDashboard(buildUser())

    expect(wrapper.find('[data-testid^="active-toggle-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="public-opt-in-toggle"]').exists()).toBe(false)
    for (const gone of ['start a plan', 'no active plan', 'painting active until', 'share new designs by default', 'public', 'last painted']) {
      expect(wrapper.text()).not.toContain(gone)
    }
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

    expect(statCard(wrapper, 'designs created')).toBe('1')
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

})
