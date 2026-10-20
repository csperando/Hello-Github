import { apiFetch } from '@/services/api'
import type { PaintStatusCode } from '@/services/designs'

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

export type BackfillJobStatus = 'pending_payment' | 'awaiting_issue' | 'ready' | 'painting' | 'done' | 'failed' | 'cancelled'

/** One paint (backfill) job: created as pending_payment at checkout, moved along by the payment webhook. */
export interface iBackfillJob {
  id: string
  year: number
  status: BackfillJobStatus
  issue_url: string | null
  created_at: string
  completed_at: string | null
}

/** A design's worked-out paint status plus its latest paint job (null if never checked out). */
export interface iPaintStatus {
  paint_status: PaintStatusCode
  latest_job: iBackfillJob | null
}

/**
 * Start a checkout. On success the body's data[0] is an iCheckoutResult; a
 * 400 carries a validation message.
 */
export async function createCheckout(payload: iCheckoutPayload): Promise<Response> {
  return apiFetch('/payments/checkout', { method: 'POST', body: JSON.stringify(payload) })
}

/** The caller's design's paint status and latest paint job (data[0] is an iPaintStatus); 404 if they haven't selected it. */
export async function getPaintStatus(designId: string): Promise<Response> {
  return apiFetch(`/payments/paint-status/${designId}`)
}

/** The authenticated user's payment history, newest first. */
export async function listPayments(): Promise<Response> {
  return apiFetch('/payments')
}
