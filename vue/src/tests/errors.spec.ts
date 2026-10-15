import { describe, it, expect } from 'vitest'
import { errorMessage } from '@/services/errors'

describe('errorMessage', () => {
  it('returns the server message when it is a non-empty string', () => {
    expect(errorMessage({ error: 'Design not found.' }, 'fallback')).toBe('Design not found.')
  })

  it('falls back when error is an object (never renders raw server data)', () => {
    expect(errorMessage({ error: { type: 'StripeInvalidRequestError', raw: {} } }, 'fallback')).toBe('fallback')
  })

  it('falls back when error is missing, empty, or the body is not an object', () => {
    expect(errorMessage({}, 'fallback')).toBe('fallback')
    expect(errorMessage({ error: '  ' }, 'fallback')).toBe('fallback')
    expect(errorMessage(null, 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
