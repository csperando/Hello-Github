import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiFetchMock = vi.fn()
vi.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  githubLoginUrl: () => 'http://x/login',
}))

import { useAuthStore } from '@/stores/auth'

function meResponse(user: unknown, ok = true) {
  return { ok, json: async () => ({ data: [user] }) } as Response
}

beforeEach(() => {
  setActivePinia(createPinia())
  apiFetchMock.mockReset()
})

describe('auth store isCovered', () => {
  it('is false with no user', () => {
    expect(useAuthStore().isCovered).toBe(false)
  })

  it('is false when paid_until is null or in the past', async () => {
    apiFetchMock.mockResolvedValue(meResponse({ id: 'u1', github_username: 'x', paid_until: '2000-01-01T00:00:00Z' }))
    const store = useAuthStore()
    await store.fetchMe()
    expect(store.isCovered).toBe(false)
  })

  it('is true when paid_until is in the future', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    apiFetchMock.mockResolvedValue(meResponse({ id: 'u1', github_username: 'x', paid_until: future }))
    const store = useAuthStore()
    await store.fetchMe()
    expect(store.isCovered).toBe(true)
  })
})

describe('auth store refreshMe', () => {
  it('re-fetches /auth/me even after a prior fetch resolved', async () => {
    apiFetchMock.mockResolvedValue(meResponse({ id: 'u1', github_username: 'x', paid_until: null }))
    const store = useAuthStore()
    await store.fetchMe()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)

    const future = new Date(Date.now() + 86_400_000).toISOString()
    apiFetchMock.mockResolvedValue(meResponse({ id: 'u1', github_username: 'x', paid_until: future }))
    await store.refreshMe()

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(store.isCovered).toBe(true)
  })
})
