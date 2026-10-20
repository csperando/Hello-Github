import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import AdminUsers from '../views/admin/AdminUsers.vue'
import AdminUser from '../views/admin/AdminUser.vue'
import { useAuthStore } from '../stores/auth'

const listAdminUsersMock = vi.fn()
const getAdminUserMock = vi.fn()
const updateAdminUserMock = vi.fn()
const restoreUserDesignMock = vi.fn()
const getOrgByIdMock = vi.fn()
const getPaintStatusesMock = vi.fn()

vi.mock('@/services/admin', () => ({
  listAdminUsers: (...a: unknown[]) => listAdminUsersMock(...a),
  getAdminUser: (...a: unknown[]) => getAdminUserMock(...a),
  updateAdminUser: (...a: unknown[]) => updateAdminUserMock(...a),
  restoreUserDesign: (...a: unknown[]) => restoreUserDesignMock(...a),
}))

vi.mock('@/services/api', () => ({
  apiFetch: vi.fn(),
  getOrgById: (...a: unknown[]) => getOrgByIdMock(...a),
  searchOrgs: vi.fn(),
}))

vi.mock('@/services/designs', () => ({
  getPaintStatuses: (...a: unknown[]) => getPaintStatusesMock(...a),
}))

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response
}

const USER_ID = '3f1c2b9e-8d4a-4c7e-9b1a-2e5f6a7b8c9d'
const ADMIN_ID = '523e4567-e89b-12d3-a456-426614174012'

function detail(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: USER_ID,
      github_id: 583231,
      github_username: 'octocat',
      github_profile_url: null,
      avatar_url: null,
      name: null,
      display_name: 'The Octocat',
      email: 'octocat@example.com',
      role: 'user',
      is_active: true,
      default_charity: 42,
      created_at: '2026-08-02T00:00:00.000Z',
      ...overrides,
    },
    designs: [
      { id: 's1', design_id: 'd1', name: 'Turtles', year: 2025, start_date: '2024-12-29', custom_range: true, paint_status: 'locked', deleted_at: null, design_owner_id: USER_ID, design_deleted_at: null },
      { id: 's2', design_id: 'd2', name: 'Old wave', year: 2024, start_date: '2023-12-31', custom_range: false, paint_status: 'painted', deleted_at: '2026-10-01T00:00:00.000Z', design_owner_id: USER_ID, design_deleted_at: '2026-10-01T00:00:00.000Z' },
    ],
    payments: [
      { id: 'p1', github_username: 'octocat', kind: 'one_time', refund_state: 'refunded', amount_total_cents: 2500, amount_refunded_cents: 2500, design_name: 'Turtles', design_year: 2025, created_at: '2026-10-14T00:00:00.000Z' },
      { id: 'p2', github_username: 'octocat', kind: 'one_time', refund_state: 'paid', amount_total_cents: 2500, amount_refunded_cents: 0, design_name: 'Turtles', design_year: 2025, created_at: '2026-10-14T00:00:00.000Z' },
    ],
    contributed_cents: 2500,
  }
}

async function mountAt(path: string, currentUserId = ADMIN_ID) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = { id: currentUserId, github_username: 'admin-user', role: 'admin', is_active: true } as never
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', component: AdminUsers },
      { path: '/admin/users/:userId', component: AdminUser },
      { path: '/admin/payments', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const RouterViewHost = { template: '<RouterView />' }
  const wrapper = mount(RouterViewHost, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('admin users', () => {
  let wrapper: Awaited<ReturnType<typeof mountAt>> | undefined

  beforeEach(() => {
    listAdminUsersMock.mockReset().mockResolvedValue(
      jsonResponse({ data: [{ id: USER_ID, github_username: 'octocat', display_name: 'The Octocat', email: 'o@example.com', role: 'user', is_active: false, created_at: '2026-08-02T00:00:00.000Z', contributed_cents: 2500 }] }),
    )
    getAdminUserMock.mockReset().mockResolvedValue(jsonResponse({ data: [detail()] }))
    updateAdminUserMock.mockReset()
    restoreUserDesignMock.mockReset()
    getOrgByIdMock.mockReset().mockResolvedValue(jsonResponse({ data: { id: 42, name: 'GiveDirectly', city: 'New York', state: 'NY' } }))
    getPaintStatusesMock.mockReset().mockResolvedValue(
      jsonResponse({ data: [{ code: 'locked', label: 'painting', description: '' }, { code: 'painted', label: 'painted', description: '' }] }),
    )
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('lists users with what they contributed, flagging a disabled account, linking to each', async () => {
    wrapper = await mountAt('/admin/users')

    const row = wrapper.get('[data-testid="user-row"]')
    expect(row.text()).toContain('@octocat')
    expect(row.text()).toContain('$25.00')
    expect(row.text()).toContain('disabled')
    expect(row.get('a').attributes('href')).toBe(`/admin/users/${USER_ID}`)
  })

  it("shows a user's contributed total (refunds already off), designs with paint status, and payments", async () => {
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    expect(getAdminUserMock).toHaveBeenCalledWith(USER_ID)
    expect(wrapper.get('[data-testid="user-contributed"]').text()).toBe('$25.00')
    const designs = wrapper.findAll('[data-testid="user-design-row"]')
    expect(designs[0]!.text()).toContain('painting')
    expect(designs[1]!.text()).toContain('deleted Oct 1, 2026')
    expect(wrapper.text()).toContain('−$25.00')
  })

  it('restores a deleted design - only deleted ones offer it', async () => {
    restoreUserDesignMock.mockResolvedValue(jsonResponse({ data: [detail()] }))
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    const designs = wrapper.findAll('[data-testid="user-design-row"]')
    expect(designs[0]!.find('button').exists()).toBe(false)
    await designs[1]!.get('button').trigger('click')
    await flushPromises()

    expect(restoreUserDesignMock).toHaveBeenCalledWith(USER_ID, 'd2')
  })

  it('saves only what changed', async () => {
    updateAdminUserMock.mockResolvedValue(jsonResponse({ data: [detail({ role: 'admin', display_name: 'Octo' })] }))
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    await wrapper.get('#admin-user-name').setValue('Octo')
    await wrapper.get('#admin-user-role').setValue('admin')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateAdminUserMock).toHaveBeenCalledWith(USER_ID, { display_name: 'Octo', role: 'admin' })
    expect(wrapper.get('[role="status"]').text()).toBe('Saved.')
  })

  it('turns an account off', async () => {
    updateAdminUserMock.mockResolvedValue(jsonResponse({ data: [detail({ is_active: false })] }))
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    await wrapper.get('[data-testid="account-enabled-toggle"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateAdminUserMock).toHaveBeenCalledWith(USER_ID, { is_active: false })
  })

  it("can't save with nothing changed", async () => {
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    const save = wrapper.findAll('button').find((b) => b.text() === 'save changes')!
    expect(save.attributes('disabled')).toBeDefined()
  })

  it("locks an admin's own role and account switch, and says why", async () => {
    getAdminUserMock.mockResolvedValue(jsonResponse({ data: [detail({ id: ADMIN_ID, role: 'admin' })] }))
    wrapper = await mountAt(`/admin/users/${ADMIN_ID}`, ADMIN_ID)

    expect(wrapper.get('#admin-user-role').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="account-enabled-toggle"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain("you can't change your own role")
  })

  it("shows the server's message when saving fails", async () => {
    updateAdminUserMock.mockResolvedValue(jsonResponse({ error: "You can't remove your own admin access or turn off your own account." }, false))
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    await wrapper.get('#admin-user-role').setValue('admin')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('your own admin access')
  })

  it('says so for an unknown user', async () => {
    getAdminUserMock.mockResolvedValue(jsonResponse({ error: 'User not found.' }, false, 404))
    wrapper = await mountAt(`/admin/users/${USER_ID}`)

    expect(wrapper.get('[role="alert"]').text()).toBe('No such user.')
  })
})
