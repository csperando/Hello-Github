import { ref } from "vue"

import { searchOrgs } from "@/services/api"
import type { iOrg } from "@/services/api"

/**
 * Shared search-request handling for CharitySearchInput/CharityResultsList
 * consumers (signUp/profile.vue, Settings.vue): tracks results/loading/error
 * state and guards against an older in-flight request overwriting a newer
 * one's results.
 */
export function useCharitySearch() {
    const searchResults = ref<iOrg[]>([])
    const searchLoading = ref(false)
    const searchError = ref(false)
    const searchQuery = ref("")
    let requestId = 0

    async function handleSearch(query: string) {
        const currentRequestId = ++requestId
        searchQuery.value = query
        searchLoading.value = true
        searchError.value = false

        try {
            const res = await searchOrgs(query)
            if (currentRequestId !== requestId) return

            if (!res.ok) {
                searchError.value = true
                searchResults.value = []
                return
            }

            const body = await res.json()
            searchResults.value = body.data ?? []
        } catch {
            if (currentRequestId !== requestId) return
            searchError.value = true
            searchResults.value = []
        } finally {
            if (currentRequestId === requestId) searchLoading.value = false
        }
    }

    function handleCleared() {
        requestId++
        searchResults.value = []
        searchLoading.value = false
        searchError.value = false
        searchQuery.value = ""
    }

    return { searchResults, searchLoading, searchError, searchQuery, handleSearch, handleCleared }
}
