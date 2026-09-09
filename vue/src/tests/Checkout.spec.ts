import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import CheckoutView from '../views/Checkout.vue'
import { useAuthStore } from '@/stores/auth'

const getOrgByIdMock = vi.fn()
const searchOrgsMock = vi.fn()
vi.mock('@/services/api', () => ({
  getOrgById: (...a: unknown[]) => getOrgByIdMock(...a),
  searchOrgs: (...a: unknown[]) => searchOrgsMock(...a),
  apiFetch: vi.fn(),
  githubLoginUrl: () => 'http://x',
}))

const getDesignMock = vi.fn()
vi.mock('@/services/designs', () => ({
  getDesign: (...a: unknown[]) => getDesignMock(...a),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

const charity = { id: 7, ein: '12-3456789', name: 'GiveDirectly', street: '', city: 'NYC', state: 'NY', zip: '' }

async function mountCheckout(query: Record<string, string> = {}, user: Record<string, unknown> = { id: 'u1', github_username: 'octo' }) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/checkout', name: 'Checkout', component: CheckoutView },
      { path: '/dashboard', name: 'Dashboard', component: { template: '<div/>' } },
      { path: '/settings', name: 'Settings', component: { template: '<div/>' } },
    ],
  })
  router.push({ path: '/checkout', query })
  await router.isReady()

  const auth = useAuthStore()
  auth.user = user as never

  const wrapper = mount(CheckoutView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  getOrgByIdMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  searchOrgsMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  getDesignMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
})

describe('Checkout.vue - charity + amount', () => {
  it('prefills the charity from the user profile default', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({}, { id: 'u1', github_username: 'octo', default_charity: 7 })

    expect(getOrgByIdMock).toHaveBeenCalledWith(7)
    expect(wrapper.text()).toContain('GiveDirectly')
  })

  it('shows the "no charity" note when the user has no default', async () => {
    const wrapper = await mountCheckout()
    expect(wrapper.text()).toContain('No charity selected')
  })

  it('only shows the platform/charity split slider once a charity is chosen', async () => {
    const wrapper = await mountCheckout()
    await wrapper.find('button.continue-btn').trigger('click') // -> step 2

    expect(wrapper.find('#checkout-split').exists()).toBe(false)

    // pick a charity via the search results
    ;(wrapper.vm as unknown as { selectCharity: (o: unknown) => void }).selectCharity(charity)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#checkout-split').exists()).toBe(true)
  })

  it('enforces the $0.99 platform floor on the split slider', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({}, { id: 'u1', github_username: 'octo', default_charity: 7 })
    await wrapper.find('button.continue-btn').trigger('click')

    const slider = wrapper.find('#checkout-split')
    expect(slider.attributes('min')).toBe('99')
  })

  it('a preset sets the total and the fee box reflects the split', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({}, { id: 'u1', github_username: 'octo', default_charity: 7 })
    await wrapper.find('button.continue-btn').trigger('click')

    await wrapper.findAll('.preset-btn')[2]!.trigger('click') // $25.00
    expect(wrapper.text()).toContain('$25.00')
    // platform defaults to the floor, charity gets the rest
    expect(wrapper.text()).toContain('$0.99')
    expect(wrapper.text()).toContain('$24.01')
  })

  it('defaults the auto-renew toggle to on', async () => {
    const wrapper = await mountCheckout()
    await wrapper.find('button.continue-btn').trigger('click')
    expect(wrapper.get('[data-testid="auto-renew-toggle"]').attributes('aria-checked')).toBe('true')
  })

  it('shows the already-covered panel instead of the flow for a covered user', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const wrapper = await mountCheckout({}, { id: 'u1', github_username: 'octo', paid_until: future })
    expect(wrapper.text()).toContain("You're already covered")
    expect(wrapper.find('.step-card').exists()).toBe(false)
  })

  it('loads the originating design named in ?designId as order context', async () => {
    getDesignMock.mockResolvedValue(
      jsonResponse({ data: [{ id: 'd1', name: 'my heart', pattern: [0, 1, 2, 3, 4, 0, 0] }] }),
    )
    const wrapper = await mountCheckout({ designId: 'd1' })
    expect(getDesignMock).toHaveBeenCalledWith('d1')
    expect(wrapper.text()).toContain('my heart')
  })
})
