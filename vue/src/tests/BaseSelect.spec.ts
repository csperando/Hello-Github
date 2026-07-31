import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import BaseSelect from '../components/ui/BaseSelect.vue'

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
]

describe('BaseSelect.vue', () => {
  it('renders a native select with the given options', () => {
    const wrapper = mount(BaseSelect, { props: { modelValue: 'a', options: OPTIONS } })

    const select = wrapper.get('select')
    const optionEls = select.findAll('option')
    expect(optionEls).toHaveLength(2)
    expect(optionEls[0]!.text()).toBe('Option A')
    expect(optionEls[1]!.text()).toBe('Option B')
  })

  it('reflects modelValue as the selected value', () => {
    const wrapper = mount(BaseSelect, { props: { modelValue: 'b', options: OPTIONS } })

    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('b')
  })

  it('emits update:modelValue on change', async () => {
    const wrapper = mount(BaseSelect, { props: { modelValue: 'a', options: OPTIONS } })

    await wrapper.get('select').setValue('b')

    expect(wrapper.emitted('update:modelValue')).toEqual([['b']])
  })
})
