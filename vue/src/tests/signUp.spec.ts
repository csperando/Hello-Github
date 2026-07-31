import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import SignUpView from '../views/signUp.vue'
import { detectTimezone } from '../helpers/timezone'

const apiFetchMock = vi.fn()
const updateProfileMock = vi.fn()

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'https://api.test/auth/github/login',
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response
}

const authenticatedMeResponse = () =>
  jsonResponse({ data: [{ id: 'u1', github_username: 'lena' }] })

async function mountSignUp(initialPath = '/signup') {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/signup', component: SignUpView },
      { path: '/dashboard', component: { template: '<div>dashboard</div>' } },
    ],
  })
  router.push(initialPath)
  await router.isReady()

  const wrapper = mount(SignUpView, { global: { plugins: [pinia, router] } })
  await flushPromises()

  return { wrapper, router }
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!button) throw new Error(`button containing "${text}" not found`)
  return button
}

describe('signUp.vue', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    updateProfileMock.mockReset()
  })

  it('jumps an authenticated user straight to the profile step when landing with ?step=profile', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())

    const { wrapper } = await mountSignUp('/signup?step=profile')

    expect(wrapper.text()).toContain('Set up your profile')
    expect(wrapper.text()).toContain('@lena')
  })

  it('prefills the profile form from existing profile data on the authenticated user', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'u1',
            github_username: 'lena',
            display_name: 'Lena Ortiz',
            default_charity: 'EFF',
            public_opt_in: false,
          },
        ],
      }),
    )

    const { wrapper } = await mountSignUp('/signup?step=profile')

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Lena Ortiz')
  })

  it('defaults timezone to the detected timezone and use_real_email to false for a user with no saved preference', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())

    const { wrapper } = await mountSignUp('/signup?step=profile')

    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe(detectTimezone())
    expect(wrapper.get('[data-testid="use-real-email-toggle"]').attributes('aria-checked')).toBe('false')
  })

  it('prefills timezone and the real-email toggle from existing profile data', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'u1',
            github_username: 'lena',
            timezone: 'America/Chicago',
            use_real_email: true,
          },
        ],
      }),
    )

    const { wrapper } = await mountSignUp('/signup?step=profile')

    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('America/Chicago')
    expect(wrapper.get('[data-testid="use-real-email-toggle"]').attributes('aria-checked')).toBe('true')
  })

  it('toggling use-real-email flips its aria-checked state', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())

    const { wrapper } = await mountSignUp('/signup?step=profile')
    const toggle = wrapper.get('[data-testid="use-real-email-toggle"]')
    expect(toggle.attributes('aria-checked')).toBe('false')

    await toggle.trigger('click')

    expect(wrapper.get('[data-testid="use-real-email-toggle"]').attributes('aria-checked')).toBe('true')
  })

  it('changing the timezone select updates what finish() saves', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())
    updateProfileMock.mockResolvedValue({ ok: true })

    const { wrapper } = await mountSignUp('/signup?step=profile')
    await wrapper.get('select').setValue('America/Chicago')

    await findButton(wrapper, 'save & continue').trigger('click')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalledWith('u1', expect.objectContaining({ timezone: 'America/Chicago' }))
  })

  it('falls back to step 1 for an unauthenticated visitor even with ?step=profile', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({}, false))

    const { wrapper } = await mountSignUp('/signup?step=profile')

    expect(wrapper.text()).toContain('Connect with GitHub')
  })

  it('redirects an already-authenticated user without ?step=profile straight to /dashboard', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())

    const { router } = await mountSignUp('/signup')

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('renders charity options as buttons with aria-pressed reflecting the current selection, and selecting one via click/keyboard updates aria-pressed', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())

    const { wrapper } = await mountSignUp('/signup?step=profile')

    const giveDirectlyButton = findButton(wrapper, 'GiveDirectly')
    const effButton = findButton(wrapper, 'EFF')
    expect(giveDirectlyButton.attributes('aria-pressed')).toBe('true')
    expect(effButton.attributes('aria-pressed')).toBe('false')

    await effButton.trigger('click')

    expect(findButton(wrapper, 'EFF').attributes('aria-pressed')).toBe('true')
    expect(findButton(wrapper, 'GiveDirectly').attributes('aria-pressed')).toBe('false')
  })

  it('finish() calls the update API and only advances to the done step on success', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())
    updateProfileMock.mockResolvedValue({ ok: true })

    const { wrapper } = await mountSignUp('/signup?step=profile')

    await findButton(wrapper, 'save & continue').trigger('click')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalledWith('u1', {
      display_name: '',
      default_charity: 'GiveDirectly',
      public_opt_in: true,
      timezone: detectTimezone(),
      use_real_email: false,
    })
    expect(wrapper.text()).toContain("You're all set")
  })

  it('finish() stays on the profile step and shows an error when the save fails', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())
    updateProfileMock.mockResolvedValue({ ok: false })

    const { wrapper } = await mountSignUp('/signup?step=profile')

    await findButton(wrapper, 'save & continue').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Set up your profile')
    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('skip() advances to the done step without calling the update API', async () => {
    apiFetchMock.mockResolvedValue(authenticatedMeResponse())

    const { wrapper } = await mountSignUp('/signup?step=profile')

    await findButton(wrapper, 'skip for now').trigger('click')
    await flushPromises()

    expect(updateProfileMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain("You're all set")
  })
})
