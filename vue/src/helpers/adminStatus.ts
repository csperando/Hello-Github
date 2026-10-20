import type { RefundState } from '@/services/admin'
import type { BackfillJobStatus } from '@/services/payments'
import type { PaintStatusCode } from '@/services/designs'

export type ChipTone = 'good' | 'warn' | 'bad' | 'neutral'

// Refund state is worked out from the refunded amount, not a stored status,
// so it has no definition-table row - its wording lives here.
export const REFUND_STATE_LABELS: Record<RefundState, string> = {
  paid: 'paid',
  partially_refunded: 'partially refunded',
  refunded: 'refunded',
}

export const REFUND_STATE_TONES: Record<RefundState, ChipTone> = {
  paid: 'good',
  partially_refunded: 'warn',
  refunded: 'neutral',
}

export const JOB_STATUS_TONES: Record<BackfillJobStatus, ChipTone> = {
  pending_payment: 'neutral',
  awaiting_issue: 'warn',
  ready: 'warn',
  painting: 'warn',
  done: 'good',
  failed: 'bad',
  cancelled: 'neutral',
}

export const PAINT_STATUS_TONES: Record<PaintStatusCode, ChipTone> = {
  unpainted: 'neutral',
  locked: 'warn',
  painted: 'good',
  error: 'bad',
}
