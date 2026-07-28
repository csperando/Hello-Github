import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import router from '../router'

const apiFetchMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  updateProfile: vi.fn(),
}))

function meResponse(user: unknown | null) {
  return {
    ok: user !== null,
    json: async () => ({ data: user ? [user] : [] }),
  }
}

describe('router /admin guard', () => {
  beforeEach(async () => {
    apiFetchMock.mockReset()
    setActivePinia(createPinia())
    // vue-router treats navigating to the route you're already on as a no-op
    // (guards don't re-run) - reset to home between tests so each /admin push is a real navigation
    apiFetchMock.mockResolvedValue(meResponse(null))
    await router.push('/')
  })

  it('redirects an unauthenticated visitor to /signup', async () => {
    apiFetchMock.mockResolvedValue(meResponse(null))

    await router.push('/admin')

    expect(router.currentRoute.value.path).toBe('/signup')
  })

  it('redirects an authenticated non-admin to /dashboard', async () => {
    apiFetchMock.mockResolvedValue(
      meResponse({ id: 'u2', github_username: 'dev', github_email: 'dev@example.com', role: 'user' }),
    )

    await router.push('/admin')

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('lets an authenticated admin reach the admin page', async () => {
    apiFetchMock.mockResolvedValue(
      meResponse({
        id: 'u3',
        github_username: 'root',
        github_email: 'root@example.com',
        role: 'admin',
        is_active: true,
      }),
    )

    await router.push('/admin')

    expect(router.currentRoute.value.path).toBe('/admin')
    expect(router.currentRoute.value.name).toBe('Admin')
  })

  it('redirects an authenticated but deactivated admin to /dashboard', async () => {
    apiFetchMock.mockResolvedValue(
      meResponse({
        id: 'u4',
        github_username: 'exadmin',
        github_email: 'exadmin@example.com',
        role: 'admin',
        is_active: false,
      }),
    )

    await router.push('/admin')

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })
})

describe('router /settings guard', () => {
  beforeEach(async () => {
    apiFetchMock.mockReset()
    setActivePinia(createPinia())
    // vue-router treats navigating to the route you're already on as a no-op
    // (guards don't re-run) - reset to home between tests so each /settings push is a real navigation
    apiFetchMock.mockResolvedValue(meResponse(null))
    await router.push('/')
  })

  it('redirects an unauthenticated visitor to /signup', async () => {
    apiFetchMock.mockResolvedValue(meResponse(null))

    await router.push('/settings')

    expect(router.currentRoute.value.path).toBe('/signup')
  })

  it('lets an authenticated non-admin reach /settings', async () => {
    apiFetchMock.mockResolvedValue(
      meResponse({ id: 'u5', github_username: 'dev', github_email: 'dev@example.com', role: 'user' }),
    )

    await router.push('/settings')

    expect(router.currentRoute.value.path).toBe('/settings')
    expect(router.currentRoute.value.name).toBe('Settings')
  })

  it('lets an authenticated admin reach /settings', async () => {
    apiFetchMock.mockResolvedValue(
      meResponse({
        id: 'u6',
        github_username: 'root',
        github_email: 'root@example.com',
        role: 'admin',
        is_active: true,
      }),
    )

    await router.push('/settings')

    expect(router.currentRoute.value.path).toBe('/settings')
    expect(router.currentRoute.value.name).toBe('Settings')
  })
})
