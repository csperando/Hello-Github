import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createDesign as apiCreateDesign,
  listSelections as apiListSelections,
  updateDesign as apiUpdateDesign,
  updateSelection as apiUpdateSelection,
  deleteSelection as apiDeleteSelection,
  type iDesign,
  type iDesignSelection,
  type iDesignSelectionWithDesign,
  type iDesignCreatePayload,
  type iDesignUpdatePayload,
  type iDesignSelectionUpdatePayload,
} from '@/services/designs'

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

  /** Toggles is_active on the caller's own selection. Returns the server's error message on a 400 conflict (e.g. another design already active), so the UI can show it and roll back. */
  async function setActive(designId: string, isActive: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await apiUpdateSelection(designId, { is_active: isActive })
    const body = await res.json()

    if (!res.ok) {
      return { ok: false, error: body.error ?? 'Could not update this design.' }
    }

    const updated = body.data?.[0] ?? null
    if (updated) {
      selections.value = selections.value.map((s) => (s.design_id === designId ? { ...s, is_active: updated.is_active } : s))
    }
    return { ok: true }
  }

  /** Updates the caller's own selection's schedule (start_date/repeat_indefinitely/recurrence_end_date). */
  async function updateSelectionSchedule(
    designId: string,
    payload: Pick<iDesignSelectionUpdatePayload, 'start_date' | 'repeat_indefinitely' | 'recurrence_end_date'>,
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
              repeat_indefinitely: updated.repeat_indefinitely,
              recurrence_end_date: updated.recurrence_end_date,
            }
          : s,
      )
    }
    return updated
  }

  async function removeSelection(designId: string): Promise<boolean> {
    const res = await apiDeleteSelection(designId)
    if (!res.ok) return false

    selections.value = selections.value.filter((s) => s.design_id !== designId)
    return true
  }

  return {
    selections,
    isLoading,
    fetchSelections,
    createDesign,
    updateDesignContent,
    setActive,
    updateSelectionSchedule,
    removeSelection,
  }
})
