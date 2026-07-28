import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import ToggleSwitch from '../components/ui/ToggleSwitch.vue'

describe('ToggleSwitch.vue', () => {
  it('renders as a native button with switch semantics reflecting the checked prop', () => {
    const wrapper = mount(ToggleSwitch, { props: { checked: true } })

    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-checked')).toBe('true')
  })

  it('reflects an unchecked state in aria-checked', () => {
    const wrapper = mount(ToggleSwitch, { props: { checked: false } })

    expect(wrapper.get('button').attributes('aria-checked')).toBe('false')
  })

  it('forwards a click listener to the root button so it is keyboard/click operable', async () => {
    const onClick = vi.fn()
    const wrapper = mount(ToggleSwitch, { props: { checked: false }, attrs: { onClick } })

    await wrapper.get('button').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
