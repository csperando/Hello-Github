import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createDesign as apiCreateDesign,
  listSelections as apiListSelections,
  updateDesign as apiUpdateDesign,
  updateSelection as apiUpdateSelection,
  deleteSelection as apiDeleteSelection,
  getPaintStatuses as apiGetPaintStatuses,
  type iDesign,
  type iDesignSelection,
  type iDesignSelectionWithDesign,
  type iDesignCreatePayload,
  type iDesignUpdatePayload,
  type iDesignSelectionUpdatePayload,
  type iPaintStatusDefinition,
  type PaintStatusCode,
} from '@/services/designs'
import { errorMessage } from '@/services/errors'

function toJoinedRow(design: iDesign, selection: iDesignSelection): iDesignSelectionWithDesign {
  return {
    ...selection,
    name: design.name,
    is_public: design.is_public,
    pattern: design.pattern,
    design_owner_id: design.user_id,
  }
}

export const useDesignsStore = defineStore('designs', () => {
  const selections = ref<iDesignSelectionWithDesign[]>([])
  const isLoading = ref(false)
  // the wording for each paint_status code, from the API's definition table
  const paintStatuses = ref<Record<string, iPaintStatusDefinition>>({})

  async function fetchPaintStatuses(): Promise<void> {
    if (Object.keys(paintStatuses.value).length > 0) return
    const res = await apiGetPaintStatuses()
    if (!res.ok) return
    const body = await res.json()
    const definitions: iPaintStatusDefinition[] = body.data ?? []
    paintStatuses.value = Object.fromEntries(definitions.map((d) => [d.code, d]))
  }

  /** The label for a paint_status code - the code itself until the definitions have loaded. */
  function paintStatusLabel(code: PaintStatusCode | undefined): string {
    if (!code) return ''
    return paintStatuses.value[code]?.label ?? code
  }

  async function fetchSelections(): Promise<void> {
    isLoading.value = true
    try {
      const res = await apiListSelections()
      if (!res.ok) {
        selections.value = []
        return
      }
      const body = await res.json()
      selections.value = body.data ?? []
    } finally {
      isLoading.value = false
    }
  }

  async function createDesign(
    payload: iDesignCreatePayload,
  ): Promise<{ design: iDesign; selection: iDesignSelection } | null> {
    const res = await apiCreateDesign(payload)
    if (!res.ok) return null

    const body = await res.json()
    const created = body.data?.[0] ?? null
    if (created) {
      selections.value = [toJoinedRow(created.design, created.selection), ...selections.value]
    }
    return created
  }

  async function updateDesignContent(designId: string, payload: iDesignUpdatePayload): Promise<iDesign | null> {
    const res = await apiUpdateDesign(designId, payload)
    if (!res.ok) return null

    const body = await res.json()
    const design = body.data?.[0] ?? null
    if (design) {
      selections.value = selections.value.map((s) =>
        s.design_id === designId ? { ...s, name: design.name, is_public: design.is_public, pattern: design.pattern } : s,
      )
    }
    return design
  }

  /** Updates the caller's own selection's schedule (year/start_date/custom_range, plus the reserved recurrence fields). */
  async function updateSelectionSchedule(
    designId: string,
    payload: Pick<
      iDesignSelectionUpdatePayload,
      'year' | 'start_date' | 'custom_range' | 'repeat_indefinitely' | 'recurrence_end_date'
    >,
  ): Promise<iDesignSelection | null> {
    const res = await apiUpdateSelection(designId, payload)
    if (!res.ok) return null

    const body = await res.json()
    const updated = body.data?.[0] ?? null
    if (updated) {
      selections.value = selections.value.map((s) =>
        s.design_id === designId
          ? {
              ...s,
              start_date: updated.start_date,
              year: updated.year,
              custom_range: updated.custom_range,
              paint_status: updated.paint_status,
              repeat_indefinitely: updated.repeat_indefinitely,
              recurrence_end_date: updated.recurrence_end_date,
            }
          : s,
      )
    }
    return updated
  }

  /** Deletes the caller's own selection. Returns the server's message on failure (e.g. a 409 while it's being painted). */
  async function removeSelection(designId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await apiDeleteSelection(designId)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, error: errorMessage(body, 'Could not delete this design.') }
    }

    selections.value = selections.value.filter((s) => s.design_id !== designId)
    return { ok: true }
  }

  return {
    selections,
    isLoading,
    paintStatuses,
    fetchPaintStatuses,
    paintStatusLabel,
    fetchSelections,
    createDesign,
    updateDesignContent,
    updateSelectionSchedule,
    removeSelection,
  }
})
