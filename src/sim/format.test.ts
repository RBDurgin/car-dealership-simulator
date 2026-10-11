import { describe, expect, it } from 'vitest'
import { formatMoney } from './format'

describe('formatMoney', () => {
  it('formats whole dollars', () => {
    expect(formatMoney(24_300)).toBe('$24,300')
    expect(formatMoney(-1_250.4)).toBe('-$1,250')
  })
})
