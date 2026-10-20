import { apiFetch } from '@/services/api'
import type { PaintStatusCode } from '@/services/designs'
import type { BackfillJobStatus } from '@/services/payments'

/** How much of a payment has been refunded - worked out by the API from the refunded amount. */
export type RefundState = 'paid' | 'partially_refunded' | 'refunded'

export interface iAdminPayment {
  id: string
  user_id: string
  github_username: string
  user_email: string | null
  kind: 'one_time' | 'subscription'
  status: string
  refund_state: RefundState
  amount_total_cents: number
  amount_platform_cents: number
  amount_charity_cents: number
  amount_refunded_cents: number
  charity_ein_id: number | null
  charity_name: string | null
  design_name: string | null
  design_year: number | null
  stripe_object_id: string | null
  stripe_refund_id: string | null
  refunded_at: string | null
  admin_note: string | null
  created_at: string
}

export interface iRefundPayload {
  amount_refunded_cents: number
  refunded_at?: string | null
  stripe_refund_id?: string | null
  admin_note?: string | null
}

export type AdminJobFilter = 'all' | 'needs_attention' | 'in_progress' | 'painted' | 'cancelled' | 'pending_payment'

export interface iAdminJob {
  id: string
  selection_id: string
  user_id: string
  github_username: string
  design_id: string
  design_name: string
  year: number
  status: BackfillJobStatus
  /** The status's wording, from the API's definition table. */
  status_label: string
  pattern: number[]
  start_date: string
  custom_range: boolean
  issue_url: string | null
  last_error: string | null
  stripe_payment_intent_id: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface iAdminJobList {
  jobs: iAdminJob[]
  counts: Record<AdminJobFilter, number>
}

/** One line of a record's history: an admin change (with who) or an event (by is null). */
export interface iHistoryEntry {
  what: string
  when: string
  by: string | null
  changes?: Record<string, unknown>
}

export interface iAdminUserSummary {
  id: string
  github_username: string
  display_name: string | null
  email: string | null
  role: 'user' | 'admin'
  is_active: boolean
  created_at: string
  contributed_cents: number
}

export interface iAdminUserDesign {
  id: string
  design_id: string
  name: string
  year: number
  start_date: string
  custom_range: boolean
  paint_status: PaintStatusCode
  deleted_at: string | null
  design_owner_id: string
  design_deleted_at: string | null
}

export interface iAdminUserDetail {
  user: {
    id: string
    github_id: number
    github_username: string
    github_profile_url: string | null
    avatar_url: string | null
    name: string | null
    display_name: string | null
    email: string | null
    role: 'user' | 'admin'
    is_active: boolean
    default_charity: number | null
    created_at: string
  }
  designs: iAdminUserDesign[]
  payments: iAdminPayment[]
  contributed_cents: number
}

export interface iAdminUserUpdate {
  display_name?: string
  role?: 'user' | 'admin'
  is_active?: boolean
  default_charity?: number
}

function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => !!entry[1])
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : ''
}

// ---- payments ---------------------------------------------------------------

export async function listAdminPayments(filters: { search?: string; status?: RefundState | ''; since?: string } = {}): Promise<Response> {
  return apiFetch(`/admin/payments${query({ search: filters.search, status: filters.status || undefined, since: filters.since })}`)
}

/** Records a refund made in Stripe - moves no money. data[0] is the updated payment. */
export async function recordRefund(paymentId: string, payload: iRefundPayload): Promise<Response> {
  return apiFetch(`/admin/payments/${paymentId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export async function getPaymentHistory(paymentId: string): Promise<Response> {
  return apiFetch(`/admin/payments/${paymentId}/history`)
}

// ---- paint jobs -------------------------------------------------------------

/** data[0] is an iAdminJobList. */
export async function listAdminJobs(filter: AdminJobFilter = 'all'): Promise<Response> {
  return apiFetch(`/admin/jobs${query({ filter: filter === 'all' ? undefined : filter })}`)
}

/** A failed paint back in the queue, repainting the same copy - no new payment. data[0] is the job. */
export async function retryJob(jobId: string): Promise<Response> {
  return apiFetch(`/admin/jobs/${jobId}/retry`, { method: 'POST' })
}

export async function cancelJob(jobId: string): Promise<Response> {
  return apiFetch(`/admin/jobs/${jobId}/cancel`, { method: 'POST' })
}

export async function getJobHistory(jobId: string): Promise<Response> {
  return apiFetch(`/admin/jobs/${jobId}/history`)
}

// ---- users ------------------------------------------------------------------

export async function listAdminUsers(search = ''): Promise<Response> {
  return apiFetch(`/admin/users${query({ search: search || undefined })}`)
}

/** data[0] is an iAdminUserDetail. */
export async function getAdminUser(userId: string): Promise<Response> {
  return apiFetch(`/admin/users/${userId}`)
}

/** data[0] is the updated iAdminUserDetail. */
export async function updateAdminUser(userId: string, payload: iAdminUserUpdate): Promise<Response> {
  return apiFetch(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

/** data[0] is the updated iAdminUserDetail. */
export async function restoreUserDesign(userId: string, designId: string): Promise<Response> {
  return apiFetch(`/admin/users/${userId}/designs/${designId}/restore`, { method: 'POST' })
}
