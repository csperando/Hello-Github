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
  githubPaintUrl: (designId: string) => `http://x/auth/github/paint?designId=${designId}`,
}))

const getDesignMock = vi.fn()
vi.mock('@/services/designs', () => ({
  getDesign: (...a: unknown[]) => getDesignMock(...a),
}))

const createCheckoutMock = vi.fn()
const getPaintStatusMock = vi.fn()
vi.mock('@/services/payments', () => ({
  createCheckout: (...a: unknown[]) => createCheckoutMock(...a),
  getPaintStatus: (...a: unknown[]) => getPaintStatusMock(...a),
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

/** GET /payments/paint-status's response: the design's paint status and its latest job (if any). */
const paintStatus = (code: string, jobStatus: string | null = null) =>
  jsonResponse({
    data: [{ paint_status: code, latest_job: jobStatus ? { id: 'j1', year: 2025, status: jobStatus, issue_url: null } : null }],
  })

async function mountCheckout(query: Record<string, string> = { designId: 'd1' }, user: Record<string, unknown> = { id: 'u1', github_username: 'octo' }) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/checkout', name: 'Checkout', component: CheckoutView },
      { path: '/dashboard', name: 'Dashboard', component: { template: '<div/>' } },
      { path: '/settings', name: 'Settings', component: { template: '<div/>' } },
      { path: '/editor', name: 'Editor', component: { template: '<div/>' } },
    ],
  })
  router.push({ path: '/checkout', query })
  await router.isReady()

  const auth = useAuthStore()
  auth.user = user as never

  const wrapper = mount(CheckoutView, { global: { plugins: [router] } })
  await flushPromises()
  return Object.assign(wrapper, { router })
}

beforeEach(() => {
  getOrgByIdMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  searchOrgsMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  getDesignMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  createCheckoutMock.mockReset().mockResolvedValue(
    jsonResponse({ data: [{ client_secret: 'cs_1', amount_total_cents: 1000 }] }),
  )
  getPaintStatusMock.mockReset().mockResolvedValue(paintStatus('unpainted'))
  confirmPaymentMock.mockReset().mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
  paymentElementMountMock.mockReset()
  readyCb = undefined
  apiFetchMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function toCardPhase(wrapper: Awaited<ReturnType<typeof mountCheckout>>) {
  await wrapper.find('button.continue-btn').trigger('click') // step 1 -> 2
  await wrapper.find('.actions-between .pay-btn').trigger('click') // continueToPayment
  await flushPromises()
}

describe('Checkout.vue - charity + amount', () => {
  it('prefills the charity from the user profile default', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({ designId: 'd1' }, { id: 'u1', github_username: 'octo', default_charity: 7 })

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

    const wrapper = await mountCheckout({ designId: 'd1' }, { id: 'u1', github_username: 'octo', default_charity: 7 })
    expect(wrapper.text()).toContain('GiveDirectly')

    await wrapper.find('input[placeholder="search for a charity"]').setValue('khan')
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('Khan Academy'))!.trigger('click')

    expect(wrapper.text()).toContain('Khan Academy')
  })

  it('lets the user clear the charity back to platform-only', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({ designId: 'd1' }, { id: 'u1', github_username: 'octo', default_charity: 7 })

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

  it('lets the split slider go down to a $0 platform share', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({ designId: 'd1' }, { id: 'u1', github_username: 'octo', default_charity: 7 })
    await wrapper.find('button.continue-btn').trigger('click')

    const slider = wrapper.find('#checkout-split')
    expect(slider.attributes('min')).toBe('0')

    await slider.setValue(0)
    expect(wrapper.text()).toContain('$10.00')
    expect(wrapper.text()).toContain('$0.00')
  })

  it('a preset sets the total and the fee box reflects the split', async () => {
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: charity }))
    const wrapper = await mountCheckout({ designId: 'd1' }, { id: 'u1', github_username: 'octo', default_charity: 7 })
    await wrapper.find('button.continue-btn').trigger('click')

    await wrapper.findAll('.preset-btn')[2]!.trigger('click') // $25.00
    expect(wrapper.text()).toContain('$25.00')
    // platform defaults to the suggested $0.99, charity gets the rest
    expect(wrapper.text()).toContain('$0.99')
    expect(wrapper.text()).toContain('$24.01')
  })

  it('has no auto-renew toggle (every purchase is one-time)', async () => {
    const wrapper = await mountCheckout()
    await wrapper.find('button.continue-btn').trigger('click')
    expect(wrapper.find('[data-testid="auto-renew-toggle"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('auto-renew')
  })

  it('does not block a user whose paid_until is still in the future', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const wrapper = await mountCheckout({ designId: 'd1' }, { id: 'u1', github_username: 'octo', paid_until: future })
    expect(wrapper.text()).not.toContain("You're already covered")
    expect(wrapper.find('.step-card').exists()).toBe(true)
  })

  it('redirects to the editor without a designId', async () => {
    const wrapper = await mountCheckout({})
    expect(wrapper.router.currentRoute.value.path).toBe('/editor')
  })

  it('describes the purchase as painting the design onto its year', async () => {
    const wrapper = await mountCheckout({ designId: 'd1', year: '2025' })
    await wrapper.find('button.continue-btn').trigger('click')
    expect(wrapper.text()).toContain('your 2025 contribution graph')
  })

  it('warns before buying an already-painted, unchanged design again, and only continues once the user confirms', async () => {
    getPaintStatusMock.mockResolvedValue(paintStatus('painted', 'done'))
    const wrapper = await mountCheckout()

    expect(getPaintStatusMock).toHaveBeenCalledWith('d1')
    expect(wrapper.text()).toContain("You've already painted this design")
    expect(wrapper.find('.step-card').exists()).toBe(false)

    await wrapper.get('[data-testid="donate-again"]').trigger('click')
    expect(wrapper.find('.step-card').exists()).toBe(true)
  })

  it('goes straight to checkout for a painted design that has been edited since (unpainted)', async () => {
    getPaintStatusMock.mockResolvedValue(paintStatus('unpainted', 'done'))
    const wrapper = await mountCheckout()

    expect(wrapper.text()).not.toContain("You've already painted this design")
    expect(wrapper.find('.step-card').exists()).toBe(true)
  })

  it("won't check out a design that's being painted", async () => {
    getPaintStatusMock.mockResolvedValue(paintStatus('locked', 'painting'))
    const wrapper = await mountCheckout()

    expect(wrapper.find('[data-testid="locked-notice"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('This design is being painted')
    expect(wrapper.find('.step-card').exists()).toBe(false)
    expect(wrapper.find('[data-testid="donate-again"]').exists()).toBe(false)
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
      designId: 'd1',
      charityEinId: 7,
      attemptId: expect.stringMatching(UUID_RE),
    })
    expect(paymentElementMountMock).toHaveBeenCalledWith('#payment-element')
    expect(wrapper.find('#payment-element').exists()).toBe(true)
  })

  it('omits charityEinId for a no-charity purchase', async () => {
    const wrapper = await mountCheckout()
    await toCardPhase(wrapper)

    expect(createCheckoutMock).toHaveBeenCalledWith({
      totalCents: 1000,
      platformCents: 1000,
      designId: 'd1',
      attemptId: expect.stringMatching(UUID_RE),
    })
  })

  it('reuses one attemptId within a visit and uses a new one on the next visit', async () => {
    const first = await mountCheckout()
    await toCardPhase(first)
    await first.find('.text-btn').trigger('click') // edit amount
    await first.find('.actions-between .pay-btn').trigger('click')
    await flushPromises()

    const second = await mountCheckout()
    await toCardPhase(second)

    const ids = createCheckoutMock.mock.calls.map((c) => (c[0] as { attemptId: string }).attemptId)
    expect(ids).toHaveLength(3)
    expect(ids[1]).toBe(ids[0])
    expect(ids[2]).not.toBe(ids[0])
  })

  it('surfaces a checkout error without leaving the amount phase', async () => {
    createCheckoutMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'bad amount' }) } as Response)
    const wrapper = await mountCheckout()
    await toCardPhase(wrapper)

    expect(wrapper.text()).toContain('bad amount')
    expect(wrapper.find('#payment-element').exists()).toBe(false)
  })

  it('confirms the payment, then polls for the backfill job and sends the user to grant consent', async () => {
    getDesignMock.mockResolvedValue(jsonResponse({ data: [{ id: 'd1', name: 'my heart', pattern: [0, 1, 2, 3, 4, 0, 0] }] }))
    // unpainted at mount (first purchase); by the first poll the webhook has
    // moved the paid job out of pending_payment
    getPaintStatusMock.mockResolvedValueOnce(paintStatus('unpainted')).mockResolvedValue(paintStatus('locked', 'awaiting_issue'))
    const wrapper = await mountCheckout({ designId: 'd1' })
    await toCardPhase(wrapper)
    readyCb?.()
    await wrapper.vm.$nextTick()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // a 3DS redirect must come back knowing which design was bought
    const returnUrl: string = confirmPaymentMock.mock.calls[0]![0].confirmParams.return_url
    expect(returnUrl).toContain('/checkout?designId=d1&paid=1')
    expect(wrapper.text()).toContain('One more step')
    expect(wrapper.text()).toContain('my heart')
    expect(wrapper.get('a[data-testid="paint-consent"]').attributes('href')).toBe(
      'http://x/auth/github/paint?designId=d1',
    )
  })

  it('on return from a redirect, skips the repeat-purchase warning and goes straight to the consent step', async () => {
    getPaintStatusMock.mockResolvedValue(paintStatus('locked', 'awaiting_issue'))
    const wrapper = await mountCheckout({ designId: 'd1', paid: '1' })
    await flushPromises()

    expect(wrapper.text()).not.toContain("You've already painted this design")
    expect(wrapper.find('[data-testid="locked-notice"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('One more step')
  })

  // paying again for a painted, unchanged design makes no new job - the
  // latest is still the finished one
  it('thanks a repeat purchaser without asking for consent again', async () => {
    getPaintStatusMock.mockResolvedValue(paintStatus('painted', 'done'))
    const wrapper = await mountCheckout({ designId: 'd1', paid: '1' })
    await flushPromises()

    expect(wrapper.text()).toContain("You're all set")
    expect(wrapper.find('a[data-testid="paint-consent"]').exists()).toBe(false)
  })

  it('keeps waiting while the paid job is still pending_payment, then asks for consent', async () => {
    vi.useFakeTimers()
    getPaintStatusMock
      .mockResolvedValueOnce(paintStatus('unpainted', 'pending_payment'))
      .mockResolvedValue(paintStatus('locked', 'awaiting_issue'))

    const wrapper = await mountCheckout({ designId: 'd1', paid: '1' })
    expect(wrapper.text()).toContain('Activating your commits')

    await vi.advanceTimersByTimeAsync(2000)
    vi.useRealTimers()
    await flushPromises()

    expect(wrapper.text()).toContain('One more step')
  })

  it('falls back to a "refresh in a minute" message if the webhook never lands', async () => {
    vi.useFakeTimers()
    getPaintStatusMock.mockResolvedValue(paintStatus('unpainted', 'pending_payment'))

    const wrapper = await mountCheckout({ designId: 'd1', paid: '1' })
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
