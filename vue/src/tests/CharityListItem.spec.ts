import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import CharityListItem from '../components/ui/CharityListItem.vue'

const baseProps = { name: 'GiveDirectly', letter: 'G', borderColor: 'oklch(100% 0 0 / 0.08)' }

describe('CharityListItem.vue', () => {
  it('renders as a button with aria-pressed for interactive sizes (sm/md)', () => {
    const wrapper = mount(CharityListItem, { props: { ...baseProps, size: 'md', selected: true } })

    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-pressed')).toBe('true')
  })

  it('reflects an unselected state in aria-pressed', () => {
    const wrapper = mount(CharityListItem, { props: { ...baseProps, size: 'sm', selected: false } })

    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
  })

  it('forwards a click listener to the root button', async () => {
    const onClick = vi.fn()
    const wrapper = mount(CharityListItem, { props: { ...baseProps, size: 'md' }, attrs: { onClick } })

    await wrapper.get('button').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a plain, non-interactive div for the default (lg) size', () => {
    const wrapper = mount(CharityListItem, { props: baseProps })

    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.attributes('aria-pressed')).toBeUndefined()
  })
})
