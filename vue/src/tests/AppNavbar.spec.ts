import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import AppNavbar from '../components/layout/AppNavbar.vue'
import { useAuthStore, type iAuthUser } from '../stores/auth'

const apiFetchMock = vi.fn()
const githubLoginUrlMock = vi.fn(() => 'https://api.test/auth/github/login')

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => githubLoginUrlMock(),
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  updateProfile: vi.fn(),
}))

function buildUser(overrides: Partial<iAuthUser> = {}): iAuthUser {
  return {
    id: 'u1',
    github_username: 'lena',
    github_email: 'lena@example.com',
    avatar_url: 'https://avatars.example/lena.png',
    display_name: 'Lena Ortiz',
    default_charity: 'EFF',
    public_opt_in: true,
    role: 'user',
    is_active: true,
    ...overrides,
  }
}

async function mountNavbar(props: { showLinks?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/signup', component: { template: '<div>signup</div>' } },
      { path: '/dashboard', component: { template: '<div>dashboard</div>' } },
      { path: '/admin', component: { template: '<div>admin</div>' } },
    ],
  })
  router.push('/')
  await router.isReady()

  const wrapper = mount(AppNavbar, {
    props,
    global: { plugins: [pinia, router] },
  })

  return { wrapper, router, authStore: useAuthStore() }
}

describe('AppNavbar', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    githubLoginUrlMock.mockClear()
  })

  it('renders no account UI while auth state is still loading', async () => {
    const { wrapper } = await mountNavbar()

    expect(wrapper.text()).not.toContain('sign in')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders a working sign-in button and a connect-github link when logged out', async () => {
    const { wrapper, authStore } = await mountNavbar()
    authStore.isLoading = false
    await wrapper.vm.$nextTick()

    const connectLink = wrapper.find('a[href="/signup"]')
    expect(connectLink.exists()).toBe(true)
    expect(connectLink.text()).toContain('connect github')

    const signInButton = wrapper.findAll('button').find((b) => b.text().includes('sign in'))
    expect(signInButton).toBeTruthy()

    await signInButton!.trigger('click')

    expect(githubLoginUrlMock).toHaveBeenCalled()
  })

  it('renders real avatar, name, charity status, and a working logout button when logged in', async () => {
    const { wrapper, authStore, router } = await mountNavbar()
    authStore.isLoading = false
    authStore.user = buildUser()
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    await wrapper.vm.$nextTick()

    const avatar = wrapper.find('img')
    expect(avatar.attributes('src')).toBe('https://avatars.example/lena.png')
    expect(wrapper.text()).toContain('Lena Ortiz')
    expect(wrapper.text()).toContain('supporting EFF')
    expect(wrapper.text()).not.toContain('public')

    const dashboardLink = wrapper.find('a[href="/dashboard"]')
    expect(dashboardLink.exists()).toBe(true)
    expect(dashboardLink.find('img').exists()).toBe(true)

    const logoutButton = wrapper.findAll('button').find((b) => b.text().includes('log out'))
    expect(logoutButton).toBeTruthy()

    await logoutButton!.trigger('click')
    await flushPromises()

    expect(apiFetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(authStore.user).toBeNull()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('shows the admin nav link only when showLinks is set and the user is an admin', async () => {
    const { wrapper, authStore } = await mountNavbar({ showLinks: true })
    authStore.isLoading = false
    authStore.user = buildUser({ role: 'admin' })
    await wrapper.vm.$nextTick()

    const adminLink = wrapper.find('a[href="/admin"]')
    expect(adminLink.exists()).toBe(true)
    expect(adminLink.text()).toContain('admin')
  })

  it('hides the admin nav link for a non-admin user even with showLinks set', async () => {
    const { wrapper, authStore } = await mountNavbar({ showLinks: true })
    authStore.isLoading = false
    authStore.user = buildUser({ role: 'user' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('a[href="/admin"]').exists()).toBe(false)
  })

  it('hides the admin nav link when showLinks is false even for an admin', async () => {
    const { wrapper, authStore } = await mountNavbar({ showLinks: false })
    authStore.isLoading = false
    authStore.user = buildUser({ role: 'admin' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('a[href="/admin"]').exists()).toBe(false)
  })
})
