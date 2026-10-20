import { apiFetch } from '@/services/api'

/** Content only - reusable/shareable, no scheduling state of its own. */
export interface iDesign {
  id: string
  user_id: string
  name: string
  is_public: boolean
  pattern: number[]
  created_at?: string
  updated_at?: string
}

/**
 * A selection's paint status, worked out by the API from its paint jobs -
 * see the design_paint_statuses definitions (GET /design/paint-statuses).
 */
export type PaintStatusCode = 'unpainted' | 'locked' | 'painted' | 'error'

/** One design_paint_statuses definition: the wording for a PaintStatusCode. */
export interface iPaintStatusDefinition {
  code: PaintStatusCode
  label: string
  description: string
}

/** One user's scheduling of one design: when it starts, whether/how it repeats, whether it's live. */
export interface iDesignSelection {
  id: string
  user_id: string
  design_id: string
  is_active: boolean
  /** Sunday of the pattern's first column, inside `year`'s grid. */
  start_date: string
  /** The past calendar year being painted. */
  year: number
  /** Tile the pattern forward from start_date through Dec 31 of `year`. */
  custom_range: boolean
  /** Reserved for a separate, unimplemented recurrence feature - unused by the editor. */
  repeat_indefinitely: boolean
  recurrence_end_date?: string | null
  /** locked = a paid paint is in progress, so nothing about the design can change. */
  paint_status?: PaintStatusCode
  created_at?: string
  updated_at?: string
}

/** The shape GET /design (list) returns: a selection joined with the design content it points at. */
export interface iDesignSelectionWithDesign extends iDesignSelection {
  name: string
  is_public: boolean
  pattern: number[]
  design_owner_id: string
}

export interface iDesignCreatePayload {
  name?: string
  is_public?: boolean
  pattern: number[]
  start_date: string
  year: number
  custom_range?: boolean
  repeat_indefinitely?: boolean
  recurrence_end_date?: string | null
}

export interface iDesignUpdatePayload {
  name?: string
  is_public?: boolean
  pattern?: number[]
}

export interface iDesignSelectionCreatePayload {
  start_date: string
  year: number
  custom_range?: boolean
  repeat_indefinitely?: boolean
  recurrence_end_date?: string | null
  is_active?: boolean
}

export interface iDesignSelectionUpdatePayload {
  is_active?: boolean
  start_date?: string
  year?: number
  custom_range?: boolean
  repeat_indefinitely?: boolean
  recurrence_end_date?: string | null
}

/** Creates a design and the caller's own initial selection of it together. */
export async function createDesign(payload: iDesignCreatePayload): Promise<Response> {
  return apiFetch('/design', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Lists the authenticated user's selections (authored and adopted alike), joined with design content. */
export async function listSelections(): Promise<Response> {
  return apiFetch('/design')
}

export async function getDesign(designId: string): Promise<Response> {
  return apiFetch(`/design/${designId}`)
}

/** Updates design content (name/is_public/pattern) - owner or admin only. */
export async function updateDesign(designId: string, payload: iDesignUpdatePayload): Promise<Response> {
  return apiFetch(`/design/${designId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** Selects an existing design (the caller's own, or a public one) - creates their selection of it. */
export async function selectDesign(designId: string, payload: iDesignSelectionCreatePayload): Promise<Response> {
  return apiFetch(`/design/${designId}/select`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Updates the caller's own selection of a design (scheduling fields and/or is_active). */
export async function updateSelection(designId: string, payload: iDesignSelectionUpdatePayload): Promise<Response> {
  return apiFetch(`/design/${designId}/select`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** The paint-status definitions (code/label/description) a selection's paint_status refers to. */
export async function getPaintStatuses(): Promise<Response> {
  return apiFetch('/design/paint-statuses')
}

/** Deletes the caller's own selection (soft) - and the design too, if they own it. 409 while it's being painted. */
export async function deleteSelection(designId: string): Promise<Response> {
  return apiFetch(`/design/${designId}/select`, { method: 'DELETE' })
}

/** How many *other* users currently have this design active - for the "N users are using this" warning. */
export async function getSelectionCount(designId: string): Promise<Response> {
  return apiFetch(`/design/${designId}/selections/count`)
}

export interface iDesignRunStatus {
  design_id: string
  target_date: string
  commit_count: number
  status: 'committed' | 'failed'
  created_at: string
}

/** The caller's latest run_log status per design they've ever run - for a "last painted"/"failed" display. */
export async function getLastRunStatuses(): Promise<Response> {
  return apiFetch('/design/last-run')
}
