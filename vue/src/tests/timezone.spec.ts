import { describe, it, expect } from 'vitest'
import { timezoneOptions, detectTimezone } from '../helpers/timezone'

describe('timezoneOptions', () => {
  it('returns a non-empty list of value/label pairs including a well-known zone', () => {
    const options = timezoneOptions()

    expect(options.length).toBeGreaterThan(100)
    expect(options.some((o) => o.value === 'America/Chicago')).toBe(true)
  })

  it('replaces underscores with spaces in the label but not the value', () => {
    const options = timezoneOptions()
    const chicago = options.find((o) => o.value === 'America/Chicago')

    expect(chicago?.value).toBe('America/Chicago')
    expect(chicago?.label).toBe('America/Chicago') // no underscore to replace in this one
    const losAngeles = options.find((o) => o.value === 'America/Los_Angeles')
    expect(losAngeles?.label).toBe('America/Los Angeles')
  })

  it('always includes UTC, even though Intl.supportedValuesOf omits it as an alias', () => {
    expect(timezoneOptions().some((o) => o.value === 'UTC')).toBe(true)
  })

  it('never lists UTC twice', () => {
    expect(timezoneOptions().filter((o) => o.value === 'UTC')).toHaveLength(1)
  })
})

describe('detectTimezone', () => {
  it('returns a non-empty string', () => {
    expect(typeof detectTimezone()).toBe('string')
    expect(detectTimezone().length).toBeGreaterThan(0)
  })

  it('is always among timezoneOptions() values, so a select bound to it never ends up blank', () => {
    const values = timezoneOptions().map((o) => o.value)
    expect(values).toContain(detectTimezone())
  })
})
