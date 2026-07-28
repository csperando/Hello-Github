import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import DashboardView from '../views/Dashboard.vue'
import { useAuthStore, type iAuthUser } from '../stores/auth'
import { useDesignsStore } from '../stores/designs'

const apiFetchMock = vi.fn()
const updateProfileMock = vi.fn()
const listDesignsMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}))

vi.mock('@/services/designs', () => ({
  listDesigns: (...args: unknown[]) => listDesignsMock(...args),
  createDesign: vi.fn(),
  getDesign: vi.fn(),
  updateDesign: vi.fn(),
  deleteDesign: vi.fn(),
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
    listDesignsMock.mockReset()
    listDesignsMock.mockResolvedValue(jsonResponse({ data: [] }))
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
})
