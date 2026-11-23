import { describe, expect, it } from 'vitest'
import { issuesToFieldErrors } from '../src/issues-to-field-errors.js'

describe('issuesToFieldErrors', () => {
  it('maps a top-level path to a field message', () => {
    expect(
      issuesToFieldErrors([{ path: ['name'], message: 'Required' }]),
    ).toEqual({ name: 'Required' })
  })

  it('keys a nested or index path by its first segment', () => {
    expect(
      issuesToFieldErrors([
        { path: ['address', 'city'], message: 'Required' },
        { path: ['items', 0, 'name'], message: 'Too short' },
      ]),
    ).toEqual({ address: 'Required', items: 'Too short' })
  })

  it('keeps the first message per top-level field', () => {
    expect(
      issuesToFieldErrors([
        { path: ['address', 'city'], message: 'Required' },
        { path: ['address', 'zip'], message: 'Invalid' },
      ]),
    ).toEqual({ address: 'Required' })
  })

  it('with `at`, keeps issues under that path, keyed relative to it', () => {
    const issues = [
      { path: ['name'], message: 'Too short' },
      { path: ['address', 'city'], message: 'Required' },
      { path: ['address', 'geo', 'lat'], message: 'Out of range' },
      { path: ['items', 0, 'qty'], message: 'Must be > 0' },
      { path: ['items', 1, 'qty'], message: 'Must be an integer' },
    ]
    expect(issuesToFieldErrors(issues, { at: ['address'] })).toEqual({
      city: 'Required',
      geo: 'Out of range',
    })
    expect(issuesToFieldErrors(issues, { at: ['items', 1] })).toEqual({
      qty: 'Must be an integer',
    })
  })

  it('with `at`, matches index segments given as strings or numbers', () => {
    expect(
      issuesToFieldErrors([{ path: ['items', '0', 'qty'], message: 'Bad' }], {
        at: ['items', 0],
      }),
    ).toEqual({ qty: 'Bad' })
  })

  it('with `at`, skips an issue on the object itself', () => {
    expect(
      issuesToFieldErrors([{ path: ['address'], message: 'Required' }], {
        at: ['address'],
      }),
    ).toEqual({})
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
