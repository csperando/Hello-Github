import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import CheckoutView from '../views/Checkout.vue'
import { useAuthStore } from '@/stores/auth'

const getOrgByIdMock = vi.fn()
const searchOrgsMock = vi.fn()
const apiFetchMock = vi.fn()
vi.mock('@/services/api', () => ({
  getOrgById: (...a: unknown[]) => getOrgByIdMock(...a),
  searchOrgs: (...a: unknown[]) => searchOrgsMock(...a),
  apiFetch: (...a: unknown[]) => apiFetchMock(...a),
  githubLoginUrl: () => 'http://x',
}))

const getDesignMock = vi.fn()
vi.mock('@/services/designs', () => ({
  getDesign: (...a: unknown[]) => getDesignMock(...a),
}))

const createCheckoutMock = vi.fn()
vi.mock('@/services/payments', () => ({
  createCheckout: (...a: unknown[]) => createCheckoutMock(...a),
}))

const paymentElementMountMock = vi.fn()
let readyCb: (() => void) | undefined
const paymentElement = {
  mount: paymentElementMountMock,
  on: (evt: string, cb: () => void) => {
    if (evt === 'ready') readyCb = cb
  },
}
const confirmPaymentMock = vi.fn()
const stripeInstance = {
  elements: vi.fn(() => ({ create: vi.fn(() => paymentElement) })),
  confirmPayment: confirmPaymentMock,
}
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(async () => stripeInstance),
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
  createCheckoutMock.mockReset().mockResolvedValue(
    jsonResponse({ data: [{ client_secret: 'cs_1', amount_total_cents: 1000 }] }),
  )
  confirmPaymentMock.mockReset().mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
  paymentElementMountMock.mockReset()
  readyCb = undefined
  // default /auth/me poll response: covered
  apiFetchMock.mockReset().mockResolvedValue(
    jsonResponse({ data: [{ id: 'u1', github_username: 'octo', paid_until: new Date(Date.now() + 86_400_000).toISOString() }] }),
  )
})

async function toCardPhase(wrapper: Awaited<ReturnType<typeof mountCheckout>>) {
  await wrapper.find('button.continue-btn').trigger('click') // step 1 -> 2
  await wrapper.find('.actions-between .pay-btn').trigger('click') // continueToPayment
  await flushPromises()
}

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

  it('lets the user override the prefilled charity from the search results', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const other = { ...charity, id: 9, name: 'Khan Academy' }
    searchOrgsMock.mockResolvedValue(jsonResponse({ data: [other] }))

    const wrapper = await mountCheckout({}, { id: 'u1', github_username: 'octo', default_charity: 7 })
    expect(wrapper.text()).toContain('GiveDirectly')

    await wrapper.find('input[placeholder="search for a charity"]').setValue('khan')
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('Khan Academy'))!.trigger('click')

    expect(wrapper.text()).toContain('Khan Academy')
  })

  it('lets the user clear the charity back to platform-only', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({}, { id: 'u1', github_username: 'octo', default_charity: 7 })

    await wrapper.find('.text-btn').trigger('click') // "remove charity"
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

describe('Checkout.vue - Stripe Payment Element', () => {
  it('creates the checkout with the chosen amounts and mounts the Payment Element', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout(
      { designId: 'd1' },
      { id: 'u1', github_username: 'octo', default_charity: 7 },
    )
    await toCardPhase(wrapper)

    expect(createCheckoutMock).toHaveBeenCalledWith({
      totalCents: 1000,
      platformCents: 99,
      autoRenew: true,
      designId: 'd1',
      charityEinId: 7,
    })
    expect(paymentElementMountMock).toHaveBeenCalledWith('#payment-element')
    expect(wrapper.find('#payment-element').exists()).toBe(true)
  })

  it('omits designId/charityEinId for a standalone, no-charity purchase', async () => {
    const wrapper = await mountCheckout()
    await toCardPhase(wrapper)

    expect(createCheckoutMock).toHaveBeenCalledWith({ totalCents: 1000, platformCents: 1000, autoRenew: true })
  })

  it('shows the already-covered panel when the checkout API returns 409', async () => {
    createCheckoutMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({}) } as Response)

    const wrapper = await mountCheckout()
    await toCardPhase(wrapper)

    expect(wrapper.text()).toContain("You're already covered")
  })

  it('surfaces a checkout error without leaving the amount phase', async () => {
    createCheckoutMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'bad amount' }) } as Response)
    const wrapper = await mountCheckout()
    await toCardPhase(wrapper)

    expect(wrapper.text()).toContain('bad amount')
    expect(wrapper.find('#payment-element').exists()).toBe(false)
  })

  it('confirms the payment, then polls until covered and shows the design as live', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [{ id: 'd1', name: 'my heart', pattern: [0, 1, 2, 3, 4, 0, 0] }] }))
    const wrapper = await mountCheckout({ designId: 'd1' })
    await toCardPhase(wrapper)
    readyCb?.()
    await wrapper.vm.$nextTick()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(confirmPaymentMock).toHaveBeenCalled()
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/me')
    expect(wrapper.text()).toContain("You're all set")
    expect(wrapper.text()).toContain('my heart')
  })

  it('prompts a standalone purchaser to pick a design once covered', async () => {
    const wrapper = await mountCheckout({ paid: '1' })
    await flushPromises()

    expect(wrapper.text()).toContain("You're all set")
    expect(wrapper.text()).toContain("pick a design")
    expect(wrapper.find('a[href="/editor"]').exists()).toBe(true)
  })

  it('falls back to a "refresh in a minute" message if coverage never lands', async () => {
    vi.useFakeTimers()
    apiFetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'u1', github_username: 'octo', paid_until: null }] }))

    const wrapper = await mountCheckout({ paid: '1' })
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    await flushPromises()

    expect(wrapper.text()).toContain('receipt is on its way')
    expect(wrapper.text()).toContain('refresh the dashboard')
  })

  it('shows the decline message and stays on the card phase when confirmPayment errors', async () => {
    confirmPaymentMock.mockResolvedValue({ error: { message: 'Your card was declined.' } })
    const wrapper = await mountCheckout()
    await toCardPhase(wrapper)
    readyCb?.()
    await wrapper.vm.$nextTick()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Your card was declined.')
    expect(wrapper.text()).not.toContain('Payment received')
  })
})
