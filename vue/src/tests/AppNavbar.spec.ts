import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { createRouter, createMemoryHistory } from "vue-router"

import AppNavbar from "../components/layout/AppNavbar.vue"
import { useAuthStore, type iAuthUser } from "../stores/auth"

const apiFetchMock = vi.fn()
const githubLoginUrlMock = vi.fn(() => "https://api.test/auth/github/login")

vi.mock("@/services/api", () => ({
    githubLoginUrl: () => githubLoginUrlMock(),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
    updateProfile: vi.fn(),
}))

function buildUser(overrides: Partial<iAuthUser> = {}): iAuthUser {
    return {
        id: "u1",
        github_username: "lena",
        avatar_url: "https://avatars.example/lena.png",
        display_name: "Lena Ortiz",
        default_charity: 42,
        public_opt_in: true,
        role: "user",
        is_active: true,
        ...overrides,
    }
}

async function mountNavbar(props: { sticky?: boolean } = {}) {
    const pinia = createPinia()
    setActivePinia(pinia)

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: "/", component: { template: "<div>home</div>" } },
            { path: "/signup", component: { template: "<div>signup</div>" } },
            { path: "/dashboard", component: { template: "<div>dashboard</div>" } },
            { path: "/admin", component: { template: "<div>admin</div>" } },
            { path: "/editor", component: { template: "<div>editor</div>" } },
            { path: "/settings", component: { template: "<div>settings</div>" } },
        ],
    })

    router.push("/")
    await router.isReady()
    const wrapper = mount(AppNavbar, { props, global: { plugins: [pinia, router] } })

    return { wrapper, router, authStore: useAuthStore() }
}

function getMobileNav(wrapper: Awaited<ReturnType<typeof mountNavbar>>["wrapper"]) {
    return wrapper.get('[data-testid="mobile-nav"]')
}

function getDesktopNav(wrapper: Awaited<ReturnType<typeof mountNavbar>>["wrapper"]) {
    return wrapper.get('[data-testid="desktop-nav"]')
}

async function openMobileNav(wrapper: Awaited<ReturnType<typeof mountNavbar>>["wrapper"]) {
    await getMobileNav(wrapper).get(".menu-button").trigger("click")
}

describe("AppNavbar", () => {
    beforeEach(() => {
        apiFetchMock.mockReset()
        githubLoginUrlMock.mockClear()
    })

    it("renders the commitment_ brand text", async () => {
        const { wrapper } = await mountNavbar()
        expect(wrapper.text()).toContain("commitment_")
    })

    it("renders no account UI while auth state is still loading", async () => {
        const { wrapper } = await mountNavbar()
        expect(wrapper.text()).not.toContain("sign in")
        expect(wrapper.find("img").exists()).toBe(false)
    })

    it("scopes queries to exactly one mobile header and one desktop header", async () => {
        const { wrapper } = await mountNavbar()
        expect(wrapper.findAll('[data-testid="mobile-nav"]')).toHaveLength(1)
        expect(wrapper.findAll('[data-testid="desktop-nav"]')).toHaveLength(1)
    })

    describe("mobile nav toggle", () => {
        it("hides the mobile nav's contents until the hamburger is clicked", async () => {
            const { wrapper } = await mountNavbar()
            expect(getMobileNav(wrapper).find("nav").exists()).toBe(false)
        })

        it("shows the mobile nav's contents after clicking the hamburger", async () => {
            const { wrapper } = await mountNavbar()
            await openMobileNav(wrapper)
            expect(getMobileNav(wrapper).find("nav").exists()).toBe(true)
        })

        it("hides the mobile nav's contents again after clicking the hamburger a second time", async () => {
            const { wrapper } = await mountNavbar()
            await openMobileNav(wrapper)
            await openMobileNav(wrapper)
            expect(getMobileNav(wrapper).find("nav").exists()).toBe(false)
        })
    })

    describe("logged out", () => {
        it("renders sign-in links when logged out", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            await wrapper.vm.$nextTick()
            const connectLink = getDesktopNav(wrapper).find('a[href="/signup"]')
            expect(connectLink.exists()).toBe(true)
        })

        it("shows the hash-anchor links in the open mobile nav when logged out", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            await wrapper.vm.$nextTick()
            await openMobileNav(wrapper)

            const mobileNav = getMobileNav(wrapper)
            expect(mobileNav.find('a[href="/#how"]').exists()).toBe(true)
            expect(mobileNav.find('a[href="/#give"]').exists()).toBe(true)
            expect(mobileNav.find('a[href="/#community"]').exists()).toBe(true)
        })

        it("shows sign-in and connect-github buttons in the open mobile nav when logged out", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            await wrapper.vm.$nextTick()
            await openMobileNav(wrapper)

            const mobileNav = getMobileNav(wrapper)
            const signInButton = mobileNav.findAll("button").find((b) => b.text().includes("sign in"))
            expect(signInButton).toBeTruthy()
            expect(mobileNav.find('a[href="/signup"]').exists()).toBe(true)
        })

        describe("sign-in click", () => {
            const originalLocation = window.location

            beforeEach(() => {
                Object.defineProperty(window, "location", {
                    configurable: true,
                    value: { ...originalLocation, href: "" },
                })
            })

            afterEach(() => {
                Object.defineProperty(window, "location", {
                    configurable: true,
                    value: originalLocation,
                })
            })

            it("sets window.location.href to the github login url when sign in is clicked", async () => {
                const { wrapper, authStore } = await mountNavbar()
                authStore.isLoading = false
                await wrapper.vm.$nextTick()

                const signInButton = getDesktopNav(wrapper)
                    .findAll("button")
                    .find((b) => b.text().includes("sign in"))
                await signInButton!.trigger("click")

                expect(window.location.href).toBe("https://api.test/auth/github/login")
            })
        })
    })

    describe("logged in", () => {
        it("renders user data when logged in", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser()
            apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
            await wrapper.vm.$nextTick()

            const avatar = wrapper.find("img")
            expect(avatar.attributes("src")).toBe(authStore.user.avatar_url)
            expect(wrapper.text()).toContain(authStore.user.display_name)
        })

        it("renders logout button when logged in", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser()
            await wrapper.vm.$nextTick()

            const logoutButton = getDesktopNav(wrapper)
                .findAll("button")
                .find((b) => b.text().includes("log out"))
            expect(logoutButton).toBeTruthy()
        })

        it("logout triggers api call", async () => {
            const { wrapper, authStore, router } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser()
            apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
            await wrapper.vm.$nextTick()

            const logoutButton = getDesktopNav(wrapper)
                .findAll("button")
                .find((b) => b.text().includes("log out"))
            await logoutButton!.trigger("click")
            await flushPromises()

            expect(apiFetchMock).toHaveBeenCalledWith("/auth/logout", { method: "POST" })
            expect(authStore.user).toBeNull()
            expect(router.currentRoute.value.path).toBe("/")
        })

        it("shows AccountButton and LogoutButton in the open mobile nav when authenticated", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser()
            await wrapper.vm.$nextTick()
            await openMobileNav(wrapper)

            const mobileNav = getMobileNav(wrapper)
            expect(mobileNav.find('a[href="/dashboard"]').exists()).toBe(true)
            expect(mobileNav.findAll("button").some((b) => b.text().includes("log out"))).toBe(true)
        })
    })

    describe("admin link visibility", () => {
        it("shows admin link in the desktop nav when authStore.isAdmin is true", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser({ role: "admin" })
            await wrapper.vm.$nextTick()

            expect(getDesktopNav(wrapper).find('a[href="/admin"]').exists()).toBe(true)
        })

        it("hides admin link in the desktop nav when authStore.isAdmin is false", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser({ role: "user" })
            await wrapper.vm.$nextTick()

            expect(getDesktopNav(wrapper).find('a[href="/admin"]').exists()).toBe(false)
        })

        it("shows admin link in the mobile nav when authStore.isAdmin is true", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser({ role: "admin" })
            await wrapper.vm.$nextTick()
            await openMobileNav(wrapper)

            expect(getMobileNav(wrapper).find('a[href="/admin"]').exists()).toBe(true)
        })

        it("hides admin link in the mobile nav when authStore.isAdmin is false", async () => {
            const { wrapper, authStore } = await mountNavbar()
            authStore.isLoading = false
            authStore.user = buildUser({ role: "user" })
            await wrapper.vm.$nextTick()
            await openMobileNav(wrapper)

            expect(getMobileNav(wrapper).find('a[href="/admin"]').exists()).toBe(false)
        })
    })

    describe("sticky prop", () => {
        it("applies header-sticky class when sticky is true (default)", async () => {
            const { wrapper } = await mountNavbar()
            expect(getMobileNav(wrapper).classes()).toContain("header-sticky")
            expect(getDesktopNav(wrapper).classes()).toContain("header-sticky")
        })

        it("applies header-not-sticky class when sticky prop is false", async () => {
            const { wrapper } = await mountNavbar({ sticky: false })
            expect(getMobileNav(wrapper).classes()).toContain("header-not-sticky")
            expect(getMobileNav(wrapper).classes()).not.toContain("header-sticky")
            expect(getDesktopNav(wrapper).classes()).toContain("header-not-sticky")
            expect(getDesktopNav(wrapper).classes()).not.toContain("header-sticky")
        })
    })
})
