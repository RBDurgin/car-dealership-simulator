import { describe, expect, it } from 'vitest'
import { cleanName, DEFAULT_DEALERSHIP_NAME, MAX_NAME_LENGTH } from './dealershipName'

describe('cleanName', () => {
  it('keeps a plain name', () => {
    expect(cleanName("Robert's Rides")).toBe("Robert's Rides")
  })

  it('trims and collapses spaces', () => {
    expect(cleanName('  Big   Al’s \t Autos  ')).toBe('Big Al’s Autos')
  })

  it('turns control characters into spaces', () => {
    expect(cleanName('Main\nStreet\u0000Motors')).toBe('Main Street Motors')
  })

  it('cuts a long name to the limit, without a trailing space', () => {
    const name = cleanName('A'.repeat(27) + ' Motors')
    expect(name).toBe('A'.repeat(27))
    expect(cleanName('x'.repeat(50))).toHaveLength(MAX_NAME_LENGTH)
  })

  it('falls back to the default for nothing at all', () => {
    expect(cleanName('')).toBe(DEFAULT_DEALERSHIP_NAME)
    expect(cleanName('   ')).toBe(DEFAULT_DEALERSHIP_NAME)
    expect(cleanName(undefined)).toBe(DEFAULT_DEALERSHIP_NAME)
    expect(cleanName(42)).toBe(DEFAULT_DEALERSHIP_NAME)
  })
})
