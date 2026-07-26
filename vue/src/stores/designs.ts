import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createDesign as apiCreateDesign,
  listDesigns as apiListDesigns,
  updateDesign as apiUpdateDesign,
  deleteDesign as apiDeleteDesign,
  type iDesign,
  type iDesignCreatePayload,
  type iDesignUpdatePayload,
} from '@/services/designs'

export const useDesignsStore = defineStore('designs', () => {
  const designs = ref<iDesign[]>([])
  const isLoading = ref(false)

  async function fetchDesigns(): Promise<void> {
    isLoading.value = true
    try {
      const res = await apiListDesigns()
      if (!res.ok) {
        designs.value = []
        return
      }
      const body = await res.json()
      designs.value = body.data ?? []
    } finally {
      isLoading.value = false
    }
  }

  async function createDesign(payload: iDesignCreatePayload): Promise<iDesign | null> {
    const res = await apiCreateDesign(payload)
    if (!res.ok) return null

    const body = await res.json()
    const design = body.data?.[0] ?? null
    if (design) designs.value = [design, ...designs.value]
    return design
  }

  async function updateDesign(designId: string, payload: iDesignUpdatePayload): Promise<iDesign | null> {
    const res = await apiUpdateDesign(designId, payload)
    if (!res.ok) return null

    const body = await res.json()
    const design = body.data?.[0] ?? null
    if (design) {
      designs.value = designs.value.map((d) => (d.id === designId ? design : d))
    }
    return design
  }

  async function deleteDesign(designId: string): Promise<boolean> {
    const res = await apiDeleteDesign(designId)
    if (!res.ok) return false

    designs.value = designs.value.filter((d) => d.id !== designId)
    return true
  }

  return { designs, isLoading, fetchDesigns, createDesign, updateDesign, deleteDesign }
})
