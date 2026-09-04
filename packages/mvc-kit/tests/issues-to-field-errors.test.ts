import { describe, expect, it } from 'vitest'
import { issuesToFieldErrors } from '../src/issues-to-field-errors.js'

describe('issuesToFieldErrors', () => {
  it('maps a top-level path to a field message', () => {
    expect(
      issuesToFieldErrors([{ path: ['name'], message: 'Required' }]),
    ).toEqual({ name: 'Required' })
  })

  it('flattens nested and index paths with dots', () => {
    expect(
      issuesToFieldErrors([
        { path: ['user', 'email'], message: 'Invalid' },
        { path: ['items', 0, 'name'], message: 'Too short' },
      ]),
    ).toEqual({
      'user.email': 'Invalid',
      'items.0.name': 'Too short',
    })
  })

  it('skips empty paths', () => {
    expect(issuesToFieldErrors([{ path: [], message: 'form-level' }])).toEqual(
      {},
    )
  })

  it('keeps the first message when the same path repeats', () => {
    expect(
      issuesToFieldErrors([
        { path: ['name'], message: 'Required' },
        { path: ['name'], message: 'Too short' },
      ]),
    ).toEqual({ name: 'Required' })
  })

  it('returns {} for an empty list', () => {
    expect(issuesToFieldErrors([])).toEqual({})
  })
})
