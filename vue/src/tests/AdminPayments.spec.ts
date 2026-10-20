import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AdminPayments from '../views/admin/AdminPayments.vue'

const listAdminPaymentsMock = vi.fn()
const recordRefundMock = vi.fn()
const getPaymentHistoryMock = vi.fn()

vi.mock('@/services/admin', () => ({
  listAdminPayments: (...a: unknown[]) => listAdminPaymentsMock(...a),
  recordRefund: (...a: unknown[]) => recordRefundMock(...a),
  getPaymentHistory: (...a: unknown[]) => getPaymentHistoryMock(...a),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    user_id: 'u1',
    github_username: 'octocat',
    user_email: 'octocat@example.com',
    kind: 'one_time',
    status: 'succeeded',
    refund_state: 'paid',
    amount_total_cents: 2500,
    amount_platform_cents: 500,
    amount_charity_cents: 2000,
    amount_refunded_cents: 0,
    charity_ein_id: 42,
    charity_name: 'GiveDirectly',
    design_name: 'Turtles',
    design_year: 2025,
    stripe_object_id: 'pi_1',
    stripe_refund_id: null,
    refunded_at: null,
    admin_note: null,
    created_at: '2026-10-14T00:00:00.000Z',
    ...overrides,
  }
}

async function mountPage() {
  setActivePinia(createPinia())
  const wrapper = mount(AdminPayments, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return wrapper
}

async function openFirstPayment(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  await wrapper.get('[data-testid="payment-row"] button').trigger('click')
  await flushPromises()
}

describe('AdminPayments', () => {
  let wrapper: Awaited<ReturnType<typeof mountPage>> | undefined

  beforeEach(() => {
    listAdminPaymentsMock.mockReset().mockResolvedValue(jsonResponse({ data: [payment()] }))
    recordRefundMock.mockReset()
    getPaymentHistoryMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('lists payments with what was charged, the split and the refund state', async () => {
    wrapper = await mountPage()

    const row = wrapper.get('[data-testid="payment-row"]')
    expect(row.text()).toContain('@octocat')
    expect(row.text()).toContain('$25.00')
    expect(row.text()).toContain('$5.00 platform · $20.00 GiveDirectly')
    expect(row.text()).toContain('paid')
  })

  it('loads the last 90 days by default, and refetches when a filter changes', async () => {
    wrapper = await mountPage()
    expect(listAdminPaymentsMock).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', status: '', since: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }))

    await wrapper.get('#payments-status').setValue('refunded')
    await wrapper.get('#payments-range').setValue('all')
    await flushPromises()

    expect(listAdminPaymentsMock).toHaveBeenLastCalledWith({ search: '', status: 'refunded', since: undefined })
  })

  it('debounces the search', async () => {
    vi.useFakeTimers()
    wrapper = await mountPage()
    listAdminPaymentsMock.mockClear()

    await wrapper.get('#payments-search').setValue('oc')
    await wrapper.get('#payments-search').setValue('octo')
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()

    expect(listAdminPaymentsMock).toHaveBeenCalledTimes(1)
    expect(listAdminPaymentsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'octo' }))
  })

  it('shows the search with a magnifying glass and a clear button', async () => {
    wrapper = await mountPage()
    await wrapper.get('#payments-search').setValue('octo')

    expect(wrapper.find('.leading-icon svg').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Clear search"]').exists()).toBe(true)
  })

  it('records a full refund: the amount follows the status, and the row updates', async () => {
    recordRefundMock.mockResolvedValue(jsonResponse({ data: [payment({ refund_state: 'refunded', amount_refunded_cents: 2500 })] }))
    wrapper = await mountPage()
    await openFirstPayment(wrapper)

    await wrapper.get('#refund-state').setValue('refunded')
    expect((wrapper.get('#refund-amount').element as HTMLInputElement).value).toBe('25.00')
    await wrapper.get('#refund-date').setValue('2026-10-20')
    await wrapper.get('#refund-id').setValue('re_1')
    await wrapper.get('#refund-note').setValue('charged twice')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recordRefundMock).toHaveBeenCalledWith('p1', {
      amount_refunded_cents: 2500,
      refunded_at: '2026-10-20',
      stripe_refund_id: 're_1',
      admin_note: 'charged twice',
    })
    expect(wrapper.get('[data-testid="payment-row"]').text()).toContain('refunded')
    expect(wrapper.get('[data-testid="payment-row"]').text()).toContain('−$25.00')
  })

  it('records a partial refund in dollars, as cents', async () => {
    recordRefundMock.mockResolvedValue(jsonResponse({ data: [payment({ refund_state: 'partially_refunded', amount_refunded_cents: 1050 })] }))
    wrapper = await mountPage()
    await openFirstPayment(wrapper)

    await wrapper.get('#refund-state').setValue('partially_refunded')
    await wrapper.get('#refund-amount').setValue('10.50')
    await wrapper.get('#refund-date').setValue('2026-10-20')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recordRefundMock).toHaveBeenCalledWith('p1', expect.objectContaining({ amount_refunded_cents: 1050 }))
  })

  it('catches an amount larger than the charge before sending anything', async () => {
    wrapper = await mountPage()
    await openFirstPayment(wrapper)

    await wrapper.get('#refund-state').setValue('partially_refunded')
    await wrapper.get('#refund-amount').setValue('30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recordRefundMock).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('$0.00 to $25.00')
  })

  it("shows the server's message when saving fails", async () => {
    recordRefundMock.mockResolvedValue(jsonResponse({ error: 'refunded_at is required for a refund and must be a date (YYYY-MM-DD).' }, false))
    wrapper = await mountPage()
    await openFirstPayment(wrapper)

    await wrapper.get('#refund-state').setValue('refunded')
    await wrapper.get('#refund-date').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('refunded_at is required')
  })

  it("explains that saving moves no money, and shows the payment's history", async () => {
    getPaymentHistoryMock.mockResolvedValue(jsonResponse({ data: [{ what: 'payment received', when: '2026-10-14T00:00:00.000Z', by: null }] }))
    wrapper = await mountPage()
    await openFirstPayment(wrapper)

    expect(wrapper.text()).toContain("doesn't move any money")
    expect(wrapper.text()).toContain('payment received')
    expect(getPaymentHistoryMock).toHaveBeenCalledWith('p1')
  })
})
