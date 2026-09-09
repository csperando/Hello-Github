import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import ConnectView from '../views/signUp/connect.vue'

const apiFetchMock = vi.fn()
vi.mock('@/services/api', () => ({
  apiFetch: (...a: unknown[]) => apiFetchMock(...a),
  githubLoginUrl: () => 'https://api.test/auth/github/login',
}))

function meResponse(user: unknown | null) {
  return { ok: user !== null, json: async () => ({ data: user ? [user] : [] }) } as Response
}

async function mountConnect(query: Record<string, string> = {}, user: unknown | null = null) {
  setActivePinia(createPinia())
  apiFetchMock.mockReset().mockResolvedValue(meResponse(user))

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/signup/connect', component: ConnectView },
      { path: '/dashboard', name: 'Dashboard', component: { template: '<div>dash</div>' } },
    ],
  })
  router.push({ path: '/signup/connect', query })
  await router.isReady()

  const wrapper = mount(ConnectView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('signUp/connect.vue', () => {
  it('shows the connect-with-github button to a visitor with no session', async () => {
    const { wrapper, router } = await mountConnect()
    expect(wrapper.text()).toContain('connect with github')
    expect(router.currentRoute.value.path).toBe('/signup/connect')
  })

  it('redirects an already-authenticated user to /dashboard', async () => {
    const { router } = await mountConnect({}, { id: 'u1', github_username: 'octo' })
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('stays on the connect screen for an authenticated user mid-onboarding (?step=profile)', async () => {
    const { router } = await mountConnect({ step: 'profile' }, { id: 'u1', github_username: 'octo' })
    expect(router.currentRoute.value.path).toBe('/signup/connect')
  })
})
