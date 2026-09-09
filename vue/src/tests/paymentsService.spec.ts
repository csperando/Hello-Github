import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetchMock = vi.fn()
vi.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

import { createCheckout, listPayments, setAutoRenew } from '@/services/payments'

beforeEach(() => {
  apiFetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('payments service', () => {
  it('createCheckout POSTs the payload to /payments/checkout', async () => {
    await createCheckout({ totalCents: 1000, platformCents: 300, autoRenew: true, designId: 'd1', charityEinId: 42 })

    expect(apiFetchMock).toHaveBeenCalledWith('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ totalCents: 1000, platformCents: 300, autoRenew: true, designId: 'd1', charityEinId: 42 }),
    })
  })

  it('listPayments GETs /payments', async () => {
    await listPayments()
    expect(apiFetchMock).toHaveBeenCalledWith('/payments')
  })

  it('setAutoRenew PATCHes /payments/subscription with the boolean', async () => {
    await setAutoRenew(false)
    expect(apiFetchMock).toHaveBeenCalledWith('/payments/subscription', {
      method: 'PATCH',
      body: JSON.stringify({ auto_renew: false }),
    })
  })
})
