import { apiFetch } from '@/services/api'

export interface iPayment {
  id: string
  kind: 'one_time' | 'subscription'
  status: string
  amount_total_cents: number
  amount_platform_cents: number
  amount_charity_cents: number
  charity_ein_id: number | null
  period_start: string | null
  period_end: string | null
  created_at: string
}

export interface iCheckoutPayload {
  totalCents: number
  platformCents: number
  autoRenew: boolean
  /** the design to activate once payment settles; omit for a standalone purchase */
  designId?: string
  /** an eo_bmf id; omit for a platform-only payment */
  charityEinId?: number
}

/** The checkout response: a Stripe client secret plus the server-authoritative split. */
export interface iCheckoutResult {
  client_secret: string
  amount_total_cents: number
  amount_platform_cents: number
  amount_charity_cents: number
}

/**
 * Start a checkout. On success the body's data[0] is an iCheckoutResult. A
 * 409 means the user is already covered; a 400 carries a validation message.
 */
export async function createCheckout(payload: iCheckoutPayload): Promise<Response> {
  return apiFetch('/payments/checkout', { method: 'POST', body: JSON.stringify(payload) })
}

/** The authenticated user's payment history, newest first. */
export async function listPayments(): Promise<Response> {
  return apiFetch('/payments')
}

/** Turn auto-renew on (true) or off (false) for the authenticated user. */
export async function setAutoRenew(autoRenew: boolean): Promise<Response> {
  return apiFetch('/payments/subscription', {
    method: 'PATCH',
    body: JSON.stringify({ auto_renew: autoRenew }),
  })
}
