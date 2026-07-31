import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import SettingsView from '../views/Settings.vue'
import { useAuthStore, type iAuthUser } from '../stores/auth'

const updateProfileMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: vi.fn(),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}))

function buildUser(overrides: Partial<iAuthUser> = {}): iAuthUser {
  return {
    id: 'u1',
    github_username: 'lena',
    display_name: 'Lena Ortiz',
    default_charity: 'EFF',
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
  })

  it('prefills every field from the authenticated user', async () => {
    const { wrapper } = await mountSettings(buildUser())

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Lena Ortiz')
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('America/Chicago')
    expect(wrapper.get('[data-testid="public-opt-in-toggle"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-testid="use-real-email-toggle"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('EFF')
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
      default_charity: 'EFF',
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

  it('selecting a different charity updates which one is marked selected', async () => {
    const { wrapper } = await mountSettings(buildUser({ default_charity: 'EFF' }))

    const giveDirectlyButton = wrapper.findAll('button').find((b) => b.text().includes('GiveDirectly'))
    expect(giveDirectlyButton).toBeTruthy()
    await giveDirectlyButton!.trigger('click')

    await findButton(wrapper, 'save changes').trigger('click')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalledWith('u1', expect.objectContaining({ default_charity: 'GiveDirectly' }))
  })
})
