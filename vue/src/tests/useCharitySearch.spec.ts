import { describe, it, expect, vi, beforeEach } from "vitest"

import { useCharitySearch } from "../composables/useCharitySearch"
import type { iOrg } from "../services/api"

const searchOrgsMock = vi.fn()

vi.mock("@/services/api", () => ({
    searchOrgs: (...args: unknown[]) => searchOrgsMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
    return { ok, json: async () => body } as Response
}

const orgs: iOrg[] = [
    { id: 1, ein: "111111111", name: "GiveDirectly", street: "", city: "New York", state: "NY", zip: "10001" },
]

describe("useCharitySearch", () => {
    beforeEach(() => {
        searchOrgsMock.mockReset()
    })

    it("populates results on a successful search", async () => {
        searchOrgsMock.mockResolvedValue(jsonResponse({ data: orgs }))
        const { searchResults, searchLoading, searchError, searchQuery, handleSearch } = useCharitySearch()

        const pending = handleSearch("give")
        expect(searchLoading.value).toBe(true)

        await pending

        expect(searchResults.value).toEqual(orgs)
        expect(searchLoading.value).toBe(false)
        expect(searchError.value).toBe(false)
        expect(searchQuery.value).toBe("give")
    })

    it("sets an error state and clears results on a non-ok response", async () => {
        searchOrgsMock.mockResolvedValue(jsonResponse({}, false))
        const { searchResults, searchError, handleSearch } = useCharitySearch()

        await handleSearch("give")

        expect(searchError.value).toBe(true)
        expect(searchResults.value).toEqual([])
    })

    it("sets an error state when the request throws", async () => {
        searchOrgsMock.mockRejectedValue(new Error("network down"))
        const { searchError, handleSearch } = useCharitySearch()

        await handleSearch("give")

        expect(searchError.value).toBe(true)
    })

    it("ignores an older response that resolves after a newer request", async () => {
        let resolveFirst!: (r: Response) => void
        searchOrgsMock
            .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
            .mockResolvedValueOnce(jsonResponse({ data: orgs }))

        const { searchResults, handleSearch } = useCharitySearch()

        const first = handleSearch("gi")
        const second = handleSearch("give")
        await second

        expect(searchResults.value).toEqual(orgs)

        resolveFirst(jsonResponse({ data: [] }))
        await first

        // stale first response must not clobber the newer second response's results
        expect(searchResults.value).toEqual(orgs)
    })

    it("handleCleared resets all state and invalidates any in-flight request", async () => {
        let resolvePending!: (r: Response) => void
        searchOrgsMock.mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve }))

        const { searchResults, searchLoading, searchError, searchQuery, handleSearch, handleCleared } = useCharitySearch()

        const pending = handleSearch("give")
        handleCleared()

        expect(searchResults.value).toEqual([])
        expect(searchLoading.value).toBe(false)
        expect(searchError.value).toBe(false)
        expect(searchQuery.value).toBe("")

        resolvePending(jsonResponse({ data: orgs }))
        await pending

        // the stale request resolving after clear must not repopulate results
        expect(searchResults.value).toEqual([])
        expect(searchLoading.value).toBe(false)
    })
})
