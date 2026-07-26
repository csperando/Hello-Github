import { apiFetch } from '@/services/api'

export interface iDesign {
  id: string
  user_id: string
  name: string
  is_public: boolean
  start_date: string
  end_date: string
  pattern: number[]
  repeat_indefinitely: boolean
  recurrence_end_date?: string | null
  created_at?: string
  updated_at?: string
}

export interface iDesignCreatePayload {
  name?: string
  is_public?: boolean
  start_date: string
  pattern: number[]
  repeat_indefinitely?: boolean
  recurrence_end_date?: string | null
}

export interface iDesignUpdatePayload {
  name?: string
  is_public?: boolean
  start_date?: string
  pattern?: number[]
  repeat_indefinitely?: boolean
  recurrence_end_date?: string | null
}

export async function createDesign(payload: iDesignCreatePayload): Promise<Response> {
  return apiFetch('/design', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listDesigns(): Promise<Response> {
  return apiFetch('/design')
}

export async function getDesign(designId: string): Promise<Response> {
  return apiFetch(`/design/${designId}`)
}

export async function updateDesign(designId: string, payload: iDesignUpdatePayload): Promise<Response> {
  return apiFetch(`/design/${designId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteDesign(designId: string): Promise<Response> {
  return apiFetch(`/design/${designId}`, { method: 'DELETE' })
}
