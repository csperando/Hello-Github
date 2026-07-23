import { describe, it, expect, beforeEach } from 'vitest'

import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
    let wrapper: VueWrapper

    beforeEach(async () => {
        router.push('/')
        await router.isReady()

        wrapper = mount(App, {
            global: {
                plugins: [router],
            },
        });
    });

    it('mounts renders properly', () => {
        expect(wrapper.text()).toContain('commitment_');
    });
});
