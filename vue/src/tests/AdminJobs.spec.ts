import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AdminJobs from '../views/admin/AdminJobs.vue'

const listAdminJobsMock = vi.fn()
const retryJobMock = vi.fn()
const cancelJobMock = vi.fn()
const getJobHistoryMock = vi.fn()

vi.mock('@/services/admin', () => ({
  listAdminJobs: (...a: unknown[]) => listAdminJobsMock(...a),
  retryJob: (...a: unknown[]) => retryJobMock(...a),
  cancelJob: (...a: unknown[]) => cancelJobMock(...a),
  getJobHistory: (...a: unknown[]) => getJobHistoryMock(...a),
}))

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 409, json: async () => body } as Response
}

const LABELS: Record<string, string> = { failed: 'failed', ready: 'queued', painting: 'painting', done: 'painted', cancelled: 'cancelled' }

function job(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'j1',
    selection_id: 's1',
    user_id: 'u1',
    github_username: 'hubot',
    design_id: 'd1',
    design_name: 'Turtles',
    year: 2019,
    status,
    status_label: LABELS[status] ?? status,
    pattern: [0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    start_date: '2018-12-30',
    custom_range: true,
    issue_url: 'https://github.com/o/canvas/issues/1',
    last_error: status === 'failed' ? 'git push rejected' : null,
    stripe_payment_intent_id: 'pi_1',
    created_at: '2026-10-09T00:00:00.000Z',
    updated_at: '2026-10-09T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

const counts = { all: 5, needs_attention: 1, in_progress: 2, painted: 1, cancelled: 1, pending_payment: 0 }
const list = (...jobs: unknown[]) => jsonResponse({ data: [{ jobs, counts }] })

async function mountPage() {
  setActivePinia(createPinia())
  const wrapper = mount(AdminJobs, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

async function openFirstJob(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  await wrapper.get('[data-testid="job-row"] button').trigger('click')
  await flushPromises()
}

const button = (wrapper: Awaited<ReturnType<typeof mountPage>>, text: string) => {
  const found = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!found) throw new Error(`no button "${text}"`)
  return found
}

describe('AdminJobs', () => {
  let wrapper: Awaited<ReturnType<typeof mountPage>> | undefined

  beforeEach(() => {
    listAdminJobsMock.mockReset().mockResolvedValue(list(job('failed')))
    retryJobMock.mockReset()
    cancelJobMock.mockReset()
    getJobHistoryMock.mockReset().mockResolvedValue(jsonResponse({ data: [] }))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('opens on the jobs that need attention, with a count on every filter', async () => {
    wrapper = await mountPage()

    expect(listAdminJobsMock).toHaveBeenCalledWith('needs_attention')
    expect(button(wrapper, 'needs attention').attributes('aria-pressed')).toBe('true')
    expect(button(wrapper, 'in progress').text()).toContain('2')
    expect(wrapper.get('[data-testid="job-row"]').text()).toContain('failed')
  })

  it('switches filter', async () => {
    wrapper = await mountPage()

    await button(wrapper, 'in progress').trigger('click')
    await flushPromises()

    expect(listAdminJobsMock).toHaveBeenLastCalledWith('in_progress')
  })

  it("shows a failed job's own copy and its error", async () => {
    wrapper = await mountPage()
    await openFirstJob(wrapper)

    expect(wrapper.text()).toContain('2-column custom range from Dec 30, 2018, repeating through Dec 31, 2019')
    expect(wrapper.text()).toContain('git push rejected')
  })

  it('retries only after confirming, then reloads the list', async () => {
    retryJobMock.mockResolvedValue(jsonResponse({ data: [job('ready')] }))
    wrapper = await mountPage()
    await openFirstJob(wrapper)

    await button(wrapper, 'retry paint - no new payment').trigger('click')
    expect(retryJobMock).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alertdialog"]').text()).toContain("They aren't charged again")

    listAdminJobsMock.mockClear()
    await wrapper.get('[role="alertdialog"]').findAll('button').find((b) => b.text() === 'retry paint')!.trigger('click')
    await flushPromises()

    expect(retryJobMock).toHaveBeenCalledWith('j1')
    expect(listAdminJobsMock).toHaveBeenCalled()
    // the panel follows the job to its new status
    expect(wrapper.get('aside').text()).toContain('queued')
  })

  it('backing out of the confirmation does nothing', async () => {
    wrapper = await mountPage()
    await openFirstJob(wrapper)

    await button(wrapper, 'cancel paint').trigger('click')
    await wrapper.get('[role="alertdialog"]').findAll('button').find((b) => b.text() === 'keep it')!.trigger('click')

    expect(cancelJobMock).not.toHaveBeenCalled()
  })

  it("shows the server's reason when an action is refused", async () => {
    retryJobMock.mockResolvedValue(jsonResponse({ error: 'Another paint of this design is already in progress - retry once it finishes.' }, false))
    wrapper = await mountPage()
    await openFirstJob(wrapper)

    await button(wrapper, 'retry paint - no new payment').trigger('click')
    await wrapper.get('[role="alertdialog"]').findAll('button').find((b) => b.text() === 'retry paint')!.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('already in progress')
  })

  it('offers neither retry nor cancel for a paint in progress, and says why', async () => {
    listAdminJobsMock.mockResolvedValue(list(job('painting')))
    wrapper = await mountPage()
    await openFirstJob(wrapper)

    expect(wrapper.findAll('button').some((b) => b.text().includes('retry'))).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text().includes('cancel paint'))).toBe(false)
    expect(wrapper.text()).toContain("can't be retried or cancelled")
  })

  it('offers cancel but not retry for a queued job', async () => {
    listAdminJobsMock.mockResolvedValue(list(job('ready')))
    wrapper = await mountPage()
    await openFirstJob(wrapper)

    expect(wrapper.findAll('button').some((b) => b.text().includes('retry'))).toBe(false)
    expect(button(wrapper, 'cancel paint').exists()).toBe(true)
  })
})
