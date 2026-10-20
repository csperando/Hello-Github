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

describe('auth store refreshMe', () => {
  it('re-fetches /auth/me even after a prior fetch resolved', async () => {
    apiFetchMock.mockResolvedValue(meResponse({ id: 'u1', github_username: 'x', paid_until: null }))
    const store = useAuthStore()
    await store.fetchMe()
    expect(apiFetchMock).toHaveBeenCalledTimes(1)

    apiFetchMock.mockResolvedValue(meResponse({ id: 'u1', github_username: 'renamed', paid_until: null }))
    await store.refreshMe()

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(store.user?.github_username).toBe('renamed')
  })
})
