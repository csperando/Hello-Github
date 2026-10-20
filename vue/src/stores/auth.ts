import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { apiFetch } from '@/services/api'

export interface iAuthUser {
    id: string
    github_username: string
    avatar_url?: string
    name?: string
    display_name?: string
    default_charity?: number
    public_opt_in?: boolean
    timezone?: string
    use_real_email?: boolean
    github_email?: string
    github_noreply_email?: string
    role?: 'admin' | 'user'
    is_active?: boolean
    // billing (from user_billing; absent/null means "never paid")
    paid_until?: string | null
    auto_renew?: boolean
    subscription_status?: string | null
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<iAuthUser | null>(null)
    const isLoading = ref(true)
    const isAuthenticated = computed(() => user.value !== null)
    const isAdmin = computed(() => user.value?.role === 'admin' && user.value?.is_active !== false)
    // true only while the user has a paid period that hasn't elapsed yet
    let inFlight: Promise<void> | null = null

    function fetchMe(): Promise<void> {
        if (inFlight) return inFlight

        inFlight = (async () => {
            isLoading.value = true
            try {
                const res = await apiFetch('/auth/me')
                if (!res.ok) {
                    user.value = null
                    return
                }
                const body = await res.json()
                user.value = body.data?.[0] ?? null
            } catch {
                // network error / api unreachable - treat as logged out rather than throwing,
                // so an unreachable api doesn't break app boot
                user.value = null
            } finally {
                isLoading.value = false
            }
        })()

        return inFlight
    }

    /** Force a fresh /auth/me, bypassing the boot-time in-flight cache - used to poll for paid_until after a payment. */
    async function refreshMe(): Promise<void> {
        inFlight = null
        await fetchMe()
    }

    async function logout(): Promise<void> {
        try {
            await apiFetch('/auth/logout', { method: 'POST' })
        } finally {
            user.value = null
        }
    }

    return { user, isLoading, isAuthenticated, isAdmin, fetchMe, refreshMe, logout }
})
