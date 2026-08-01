import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { createRouter, createMemoryHistory } from "vue-router"

import AppNavbar from "../components/layout/AppNavbar.vue"
import { useAuthStore, type iAuthUser } from "../stores/auth"

const apiFetchMock = vi.fn();
const githubLoginUrlMock = vi.fn(() => "https://api.test/auth/github/login");

vi.mock("@/services/api", () => ({
    githubLoginUrl: () => githubLoginUrlMock(),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
    updateProfile: vi.fn(),
}));

function buildUser(overrides: Partial<iAuthUser> = {}): iAuthUser {
    return {
        id: "u1",
        github_username: "lena",
        avatar_url: "https://avatars.example/lena.png",
        display_name: "Lena Ortiz",
        default_charity: "EFF",
        public_opt_in: true,
        role: "user",
        is_active: true,
        ...overrides,
    }
}

async function mountNavbar() {
    const pinia = createPinia();
    setActivePinia(pinia);

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
    });

    router.push("/");
    await router.isReady();
    const wrapper = mount(AppNavbar, { global: { plugins: [pinia, router] } });
    
    return { wrapper, router, authStore: useAuthStore() };
}

describe("AppNavbar", () => {
    beforeEach(() => {
        apiFetchMock.mockReset();
        githubLoginUrlMock.mockClear();
    });

    it("renders the commitment_ brand text", async () => {
        const { wrapper } = await mountNavbar();
        expect(wrapper.text()).toContain("commitment_");
    });

    it("renders no account UI while auth state is still loading", async () => {
        const { wrapper } = await mountNavbar();
        expect(wrapper.text()).not.toContain("sign in");
        expect(wrapper.find("img").exists()).toBe(false);
    });

    // it("todo - test for small viewports", async () => {
    //     const { wrapper } = await mountNavbar();
    //     expect(wrapper.get("header").classes()).toContain("hamburger");
    // });

    it("renders sign-in links when logged out", async () => {
        const { wrapper, authStore } = await mountNavbar();
        authStore.isLoading = false;
        await wrapper.vm.$nextTick();
        const connectLink = wrapper.find("a[href=\"/signup\"]");
        expect(connectLink.exists()).toBe(true);
    });

    it("renders user data when logged in", async () => {
        const { wrapper, authStore, router } = await mountNavbar();
        authStore.isLoading = false;
        authStore.user = buildUser();
        apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        await wrapper.vm.$nextTick();

        const avatar = wrapper.find("img")
        expect(avatar.attributes("src")).toBe(authStore.user.avatar_url)
        expect(wrapper.text()).toContain(authStore.user.display_name)
    });

    it("renders logout button when logged in", async () => {
        const { wrapper, authStore } = await mountNavbar();
        authStore.isLoading = false;
        authStore.user = buildUser();
        await wrapper.vm.$nextTick();

        // TODO - verify not always a button
        const logoutButton = wrapper.findAll("button").find((b) => b.text().includes("log out"));
        expect(logoutButton).toBeTruthy();
    });

    it("logout triggers api call", async () => {
        const { wrapper, authStore, router } = await mountNavbar();
        authStore.isLoading = false;
        authStore.user = buildUser();
        apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        await wrapper.vm.$nextTick();

        // TODO - verify not always a button
        const logoutButton = wrapper.findAll("button").find((b) => b.text().includes("log out"));
        await logoutButton!.trigger("click")
        await flushPromises()

        expect(apiFetchMock).toHaveBeenCalledWith("/auth/logout", { method: "POST" })
        expect(authStore.user).toBeNull()
        expect(router.currentRoute.value.path).toBe("/")
    });
});
