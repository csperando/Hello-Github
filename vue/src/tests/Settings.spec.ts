import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import SettingsView from '../views/Settings.vue'
import { useAuthStore, type iAuthUser } from '../stores/auth'
import type { iOrg } from '../services/api'

const updateProfileMock = vi.fn()
const getOrgByIdMock = vi.fn()
const searchOrgsMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: vi.fn(),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
  getOrgById: (...args: unknown[]) => getOrgByIdMock(...args),
  searchOrgs: (...args: unknown[]) => searchOrgsMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

const effOrg: iOrg = { id: 42, ein: '424242424', name: 'EFF', street: '', city: 'San Francisco', state: 'CA', zip: '94109' }
const giveDirectlyOrg: iOrg = { id: 7, ein: '777777777', name: 'GiveDirectly', street: '', city: 'New York', state: 'NY', zip: '10001' }

function buildUser(overrides: Partial<iAuthUser> = {}): iAuthUser {
  return {
    id: 'u1',
    github_username: 'lena',
    display_name: 'Lena Ortiz',
    default_charity: 42,
    public_opt_in: true,
    timezone: 'America/Chicago',
    use_real_email: false,
    role: 'user',
    is_active: true,
    ...overrides,
  }
}

async function mountSettings(user: iAuthUser | null) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const authStore = useAuthStore()
  authStore.user = user
  authStore.isLoading = false

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: SettingsView }],
  })
  router.push('/settings')
  await router.isReady()

  const wrapper = mount(SettingsView, { global: { plugins: [pinia, router] } })
  await flushPromises()

  return { wrapper, authStore }
}

function findButton(wrapper: Awaited<ReturnType<typeof mountSettings>>['wrapper'], text: string) {
  const el = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!el) throw new Error(`no button found containing "${text}"`)
  return el
}

describe('Settings.vue', () => {
  beforeEach(() => {
    updateProfileMock.mockReset()
    getOrgByIdMock.mockReset()
    searchOrgsMock.mockReset()
    getOrgByIdMock.mockResolvedValue(jsonResponse({ data: effOrg }))
  })

  it('prefills every field from the authenticated user, resolving default_charity by id', async () => {
    const { wrapper } = await mountSettings(buildUser())

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Lena Ortiz')
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('America/Chicago')
    expect(wrapper.get('[data-testid="public-opt-in-toggle"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-testid="use-real-email-toggle"]').attributes('aria-checked')).toBe('false')
    expect(getOrgByIdMock).toHaveBeenCalledWith(42)
    expect(wrapper.text()).toContain('EFF')
  })

  it('does not call getOrgById when the user has no default_charity set', async () => {
    await mountSettings(buildUser({ default_charity: undefined }))

    expect(getOrgByIdMock).not.toHaveBeenCalled()
  })

  it('saves all fields together via updateProfile', async () => {
    updateProfileMock.mockResolvedValue({ ok: true })
    const { wrapper } = await mountSettings(buildUser())

    await wrapper.find('input').setValue('New Name')
    await wrapper.get('[data-testid="use-real-email-toggle"]').trigger('click')

    await findButton(wrapper, 'save changes').trigger('click')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalledWith('u1', {
      display_name: 'New Name',
      default_charity: 42,
      public_opt_in: true,
      timezone: 'America/Chicago',
      use_real_email: true,
    })
    expect(wrapper.text()).toContain('Saved.')
  })

  it('updates the auth store user on a successful save', async () => {
    updateProfileMock.mockResolvedValue({ ok: true })
    const { wrapper, authStore } = await mountSettings(buildUser({ display_name: 'Old Name' }))

    await wrapper.find('input').setValue('New Name')
    await findButton(wrapper, 'save changes').trigger('click')
    await flushPromises()

    expect(authStore.user?.display_name).toBe('New Name')
  })

  it('shows an error and does not update the store when the save fails', async () => {
    updateProfileMock.mockResolvedValue({ ok: false })
    const { wrapper, authStore } = await mountSettings(buildUser({ display_name: 'Old Name' }))

    await wrapper.find('input').setValue('New Name')
    await findButton(wrapper, 'save changes').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Something went wrong')
    expect(authStore.user?.display_name).toBe('Old Name')
  })

  it('changing a field clears a previous "Saved." confirmation', async () => {
    updateProfileMock.mockResolvedValue({ ok: true })
    const { wrapper } = await mountSettings(buildUser())

    await findButton(wrapper, 'save changes').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Saved.')

    await wrapper.find('input').setValue('Changed')

    expect(wrapper.text()).not.toContain('Saved.')
  })

  describe('charity search', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('searching and selecting a result updates what gets saved', async () => {
      searchOrgsMock.mockResolvedValue(jsonResponse({ data: [giveDirectlyOrg] }))
      updateProfileMock.mockResolvedValue({ ok: true })
      const { wrapper } = await mountSettings(buildUser())

      await wrapper.get('input[placeholder="search for a charity"]').setValue('give')
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()

      const giveDirectlyButton = wrapper.findAll('button').find((b) => b.text().includes('GiveDirectly'))
      expect(giveDirectlyButton).toBeTruthy()
      await giveDirectlyButton!.trigger('click')

      await findButton(wrapper, 'save changes').trigger('click')
      await flushPromises()

      expect(updateProfileMock).toHaveBeenCalledWith('u1', expect.objectContaining({ default_charity: 7 }))
    })

    it('replaces the "currently selected" charity display once a new one is picked', async () => {
      searchOrgsMock.mockResolvedValue(jsonResponse({ data: [giveDirectlyOrg] }))
      const { wrapper } = await mountSettings(buildUser())
      expect(wrapper.text()).toContain('EFF')

      await wrapper.get('input[placeholder="search for a charity"]').setValue('give')
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()
      await findButton(wrapper, 'GiveDirectly').trigger('click')

      expect(findButton(wrapper, 'GiveDirectly').attributes('aria-pressed')).toBe('true')
    })
  })
})
