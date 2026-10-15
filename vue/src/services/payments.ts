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
  /** the design being bought - every checkout buys exactly one */
  designId: string
  /** an eo_bmf id; omit for a platform-only payment */
  charityEinId?: number
  /** one per checkout visit; the API scopes its Stripe idempotency key to it */
  attemptId: string
}

/** The checkout response: a Stripe client secret plus the server-authoritative split. */
export interface iCheckoutResult {
  client_secret: string
  amount_total_cents: number
  amount_platform_cents: number
  amount_charity_cents: number
}

export type BackfillJobStatus = 'awaiting_issue' | 'ready' | 'painting' | 'done' | 'failed'

/** A bought design's backfill job, created by the payment webhook. */
export interface iBackfillJob {
  id: string
  design_id: string
  year: number
  status: BackfillJobStatus
  issue_url: string | null
}

/**
 * Start a checkout. On success the body's data[0] is an iCheckoutResult; a
 * 400 carries a validation message.
 */
export async function createCheckout(payload: iCheckoutPayload): Promise<Response> {
  return apiFetch('/payments/checkout', { method: 'POST', body: JSON.stringify(payload) })
}

/** The caller's backfill job for a design (data[0] is an iBackfillJob); 404 until the webhook creates it. */
export async function getBackfillJob(designId: string): Promise<Response> {
  return apiFetch(`/payments/backfill/${designId}`)
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
