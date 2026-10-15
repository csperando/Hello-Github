import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type RouteLocationNormalized } from 'vue-router'

import ErrorView from '../views/Error.vue'
import { errorRoute } from '../router/errorRoutes'

vi.mock('@/services/api', () => ({
  githubLoginUrl: () => 'http://x/auth/github/login',
  githubPaintUrl: (designId: string) => `http://x/auth/github/paint?designId=${designId}`,
  apiFetch: vi.fn<() => Promise<Response>>(),
}))

function mountError(props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  })
  return mount(ErrorView, { props, global: { plugins: [createPinia(), router] } })
}

const routeWith = (query: Record<string, string>) => ({ query }) as unknown as RouteLocationNormalized

describe('error route', () => {
  it('passes paint_consent_failed through with its designId', () => {
    expect(errorRoute.props(routeWith({ type: 'paint_consent_failed', designId: 'd1' }))).toEqual({
      errorType: 'paint_consent_failed',
      designId: 'd1',
    })
  })
})

describe('Error.vue - paint_consent_failed', () => {
  it('reassures the user that their payment is safe', () => {
    const wrapper = mountError({ errorType: 'paint_consent_failed', designId: 'd1' })
    expect(wrapper.text()).toContain("couldn't connect your GitHub account")
    expect(wrapper.text()).toContain('payment is safe')
  })

  it('offers a straight retry of the consent for that design', () => {
    const wrapper = mountError({ errorType: 'paint_consent_failed', designId: 'd1' })
    const retry = wrapper.get('a[data-testid="paint-retry"]')
    expect(retry.attributes('href')).toBe('http://x/auth/github/paint?designId=d1')
    expect(retry.text()).toContain('try again')
  })

  it('falls back to the dashboard when the design is unknown', () => {
    const wrapper = mountError({ errorType: 'paint_consent_failed' })
    expect(wrapper.find('a[data-testid="paint-retry"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('go to dashboard')
  })
})
