import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { createRouter, createMemoryHistory } from "vue-router"

import SignUpView from "../views/signUp/layout.vue"
import ConnectView from "../views/signUp/connect.vue"
import ProfileView from "../views/signUp/profile.vue"
import DoneView from "../views/signUp/done.vue"
import CharitySearchInput from "../components/ui/CharitySearchInput.vue"
import type { iOrg } from "../services/api"

const apiFetchMock = vi.fn()
const updateProfileMock = vi.fn()
const searchOrgsMock = vi.fn()

vi.mock("@/services/api", () => ({
    githubLoginUrl: () => "https://api.test/auth/github/login",
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
    updateProfile: (...args: unknown[]) => updateProfileMock(...args),
    searchOrgs: (...args: unknown[]) => searchOrgsMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
    return { ok, json: async () => body } as Response
}

const authenticatedMeResponse = (overrides: Record<string, unknown> = {}) =>
    jsonResponse({ data: [{ id: "u1", github_username: "lena", ...overrides }] })

const orgs: iOrg[] = [
    { id: 1, ein: "111111111", name: "GiveDirectly", street: "", city: "New York", state: "NY", zip: "10001" },
    { id: 2, ein: "222222222", name: "GiveWell", street: "", city: "Oakland", state: "CA", zip: "94612" },
]

async function mountProfile() {
    const pinia = createPinia()
    setActivePinia(pinia)

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            {
                path: "/signup",
                component: SignUpView,
                children: [
                    { path: "connect", component: ConnectView },
                    { path: "profile", component: ProfileView },
                    { path: "done", component: DoneView },
                ],
            },
        ],
    })
    router.push("/signup/profile")
    await router.isReady()

    const wrapper = mount(SignUpView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    return { wrapper, router }
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
    const button = wrapper.findAll("button").find((b) => b.text().includes(text))
    if (!button) throw new Error(`button containing "${text}" not found`)
    return button
}

async function selectGiveDirectly(wrapper: Awaited<ReturnType<typeof mountProfile>>["wrapper"]) {
    searchOrgsMock.mockResolvedValue(jsonResponse({ data: orgs }))
    await wrapper.get('input[placeholder="search for a charity"]').setValue("give")
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    await findButton(wrapper, "GiveDirectly").trigger("click")
}

describe("signUp/profile.vue - charity search", () => {
    beforeEach(() => {
        apiFetchMock.mockReset()
        updateProfileMock.mockReset()
        searchOrgsMock.mockReset()
        apiFetchMock.mockResolvedValue(authenticatedMeResponse())
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("renders the magnifying-glass search icon", async () => {
        const { wrapper } = await mountProfile()

        expect(wrapper.find(".leading-icon svg").exists()).toBe(true)
    })

    it("does not call searchOrgs for fewer than 3 characters", async () => {
        const { wrapper } = await mountProfile()

        await wrapper.get('input[placeholder="search for a charity"]').setValue("gi")
        await vi.advanceTimersByTimeAsync(1000)

        expect(searchOrgsMock).not.toHaveBeenCalled()
    })

    it("calls searchOrgs once after 3+ characters and the debounce delay", async () => {
        searchOrgsMock.mockResolvedValue(jsonResponse({ data: orgs }))
        const { wrapper } = await mountProfile()

        await wrapper.get('input[placeholder="search for a charity"]').setValue("give")
        await vi.advanceTimersByTimeAsync(300)
        await flushPromises()

        expect(searchOrgsMock).toHaveBeenCalledTimes(1)
        expect(searchOrgsMock).toHaveBeenCalledWith("give")
        expect(wrapper.text()).toContain("GiveDirectly")
        expect(wrapper.text()).toContain("GiveWell")
    })

    it("coalesces rapid keystrokes inside the debounce window into a single request", async () => {
        searchOrgsMock.mockResolvedValue(jsonResponse({ data: orgs }))
        const { wrapper } = await mountProfile()
        const input = wrapper.get('input[placeholder="search for a charity"]')

        await input.setValue("giv")
        await vi.advanceTimersByTimeAsync(100)
        await input.setValue("give")
        await vi.advanceTimersByTimeAsync(100)
        await input.setValue("gived")
        await vi.advanceTimersByTimeAsync(300)
        await flushPromises()

        expect(searchOrgsMock).toHaveBeenCalledTimes(1)
        expect(searchOrgsMock).toHaveBeenCalledWith("gived")
    })

    it("shows nothing in the summary row until a search result is selected", async () => {
        const { wrapper } = await mountProfile()

        expect(wrapper.findAll("button").some((b) => b.attributes("aria-pressed") === "true")).toBe(false)
    })

    it("selecting a search result reflects it in the summary row", async () => {
        const { wrapper } = await mountProfile()

        await selectGiveDirectly(wrapper)

        const selected = wrapper.findAll("button").filter(
            (b) => b.text().includes("GiveDirectly") && b.attributes("aria-pressed") === "true",
        )
        expect(selected.length).toBeGreaterThan(0)
    })

    it("shows an error state instead of hanging on a spinner when the search fails", async () => {
        searchOrgsMock.mockResolvedValue(jsonResponse({}, false))
        const { wrapper } = await mountProfile()

        await wrapper.get('input[placeholder="search for a charity"]').setValue("give")
        await vi.advanceTimersByTimeAsync(300)
        await flushPromises()

        expect(wrapper.text()).toContain("couldn't load results")
    })

    it("typing text and clicking the clear button empties the field and clears results immediately", async () => {
        searchOrgsMock.mockResolvedValue(jsonResponse({ data: orgs }))
        const { wrapper } = await mountProfile()

        await wrapper.get('input[placeholder="search for a charity"]').setValue("give")
        await vi.advanceTimersByTimeAsync(300)
        await flushPromises()
        expect(wrapper.text()).toContain("GiveDirectly")

        await wrapper.findComponent(CharitySearchInput).get(".clear-button").trigger("click")

        expect((wrapper.get('input[placeholder="search for a charity"]').element as HTMLInputElement).value).toBe("")
        expect(wrapper.text()).not.toContain("GiveDirectly")
    })
})

describe("signUp/profile.vue - skip / save & continue", () => {
    beforeEach(() => {
        apiFetchMock.mockReset()
        updateProfileMock.mockReset()
        searchOrgsMock.mockReset()
        apiFetchMock.mockResolvedValue(authenticatedMeResponse())
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("skip navigates to /signup/done without calling updateProfile", async () => {
        const { wrapper, router } = await mountProfile()

        await findButton(wrapper, "skip for now").trigger("click")
        await flushPromises()

        expect(updateProfileMock).not.toHaveBeenCalled()
        expect(router.currentRoute.value.path).toBe("/signup/done")
    })

    it("save & continue calls updateProfile with the selected charity's id and navigates to done on success", async () => {
        updateProfileMock.mockResolvedValue({ ok: true })
        const { wrapper, router } = await mountProfile()

        await selectGiveDirectly(wrapper)

        await findButton(wrapper, "save & continue").trigger("click")
        await flushPromises()

        expect(updateProfileMock).toHaveBeenCalledWith("u1", expect.objectContaining({ default_charity: 1 }))
        expect(router.currentRoute.value.path).toBe("/signup/done")
    })

    it("save & continue with nothing selected sends default_charity: undefined", async () => {
        updateProfileMock.mockResolvedValue({ ok: true })
        const { wrapper } = await mountProfile()

        await findButton(wrapper, "save & continue").trigger("click")
        await flushPromises()

        expect(updateProfileMock).toHaveBeenCalledWith("u1", expect.objectContaining({ default_charity: undefined }))
    })

    it("shows an error and stays on the profile step when the save fails", async () => {
        updateProfileMock.mockResolvedValue({ ok: false })
        const { wrapper, router } = await mountProfile()

        await findButton(wrapper, "save & continue").trigger("click")
        await flushPromises()

        expect(wrapper.text()).toContain("Something went wrong")
        expect(router.currentRoute.value.path).toBe("/signup/profile")
    })
})

describe("signUp/profile.vue - git config preview", () => {
    beforeEach(() => {
        apiFetchMock.mockReset()
        updateProfileMock.mockReset()
        searchOrgsMock.mockReset()
    })

    it("shows the github username on the name line", async () => {
        apiFetchMock.mockResolvedValue(authenticatedMeResponse())
        const { wrapper } = await mountProfile()

        expect(wrapper.text()).toContain('git config --global user.name "lena"')
    })

    it("reactively swaps the email line when the real-email toggle flips", async () => {
        apiFetchMock.mockResolvedValue(
            authenticatedMeResponse({
                github_email: "lena@real.com",
                github_noreply_email: "123+lena@users.noreply.github.com",
            }),
        )
        const { wrapper } = await mountProfile()

        expect(wrapper.text()).toContain("123+lena@users.noreply.github.com")
        expect(wrapper.text()).not.toContain("lena@real.com")

        await wrapper.get('[data-testid="use-real-email-toggle"]').trigger("click")

        expect(wrapper.text()).toContain("lena@real.com")
        expect(wrapper.text()).not.toContain("123+lena@users.noreply.github.com")
    })
})
