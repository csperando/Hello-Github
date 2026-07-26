import { describe, it, expect, beforeEach, vi } from 'vitest'

import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'
import router from '../router'

vi.mock('@/services/api', () => ({
    githubLoginUrl: () => 'https://api.test/auth/github/login',
    apiFetch: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    updateProfile: vi.fn(),
}))

describe('App', () => {
    let wrapper: VueWrapper

    beforeEach(async () => {
        const pinia = createPinia()
        setActivePinia(pinia)

        router.push('/')
        await router.isReady()

        wrapper = mount(App, {
            global: {
                plugins: [pinia, router],
            },
        });
    });

    it('mounts renders properly', () => {
        expect(wrapper.text()).toContain('commitment_');
    });
});
