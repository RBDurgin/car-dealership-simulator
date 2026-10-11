import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, type EarnedAchievement } from './achievements'
import { emptyRecords, type Records } from './stats'
import { caseCount, emptyCase, harder, mergeCase, parseCase } from './trophyCase'

const earned = (
  id: EarnedAchievement['id'],
  level: EarnedAchievement['level'],
): EarnedAchievement => ({
  id,
  day: 3,
  level,
})

const records = (extra: Partial<Records> = {}): Records => ({ ...emptyRecords(), ...extra })

describe('harder', () => {
  it('picks the harder level', () => {
    expect(harder('easy', 'hard')).toBe('hard')
    expect(harder('hard', 'medium')).toBe('hard')
    expect(harder('medium', 'medium')).toBe('medium')
  })
})

describe('mergeCase', () => {
  it('stamps a new achievement with now and its level', () => {
    const c = mergeCase(emptyCase(), [earned('first-sale', 'easy')], emptyRecords(), 1000)
    expect(c.earned['first-sale']).toEqual({ first: 1000, level: 'easy' })
    expect(caseCount(c)).toBe(1)
  })

  it('keeps the earliest time and the hardest level', () => {
    let c = mergeCase(emptyCase(), [earned('first-sale', 'medium')], emptyRecords(), 1000)
    c = mergeCase(c, [earned('first-sale', 'hard')], emptyRecords(), 5000)
    expect(c.earned['first-sale']).toEqual({ first: 1000, level: 'hard' })
    c = mergeCase(c, [earned('first-sale', 'easy')], emptyRecords(), 9000)
    expect(c.earned['first-sale']).toEqual({ first: 1000, level: 'hard' })
  })

  it('keeps the highest of each record', () => {
    let c = mergeCase(
      emptyCase(),
      [],
      records({
        bestDay: { value: 8000, day: 4 },
        bestWeek: { value: 20_000, day: 7 },
        biggestDeal: { value: 4000, day: 2, model: 'sedan' },
        longestStreak: { value: 6, day: 6 },
      }),
      1,
    )
    c = mergeCase(
      c,
      [],
      records({
        bestDay: { value: 5000, day: 1 },
        bestMonth: { value: 50_000, day: 28 },
        longestStreak: { value: 9, day: 9 },
      }),
      2,
    )
    expect(c.best).toEqual({ day: 8000, week: 20_000, month: 50_000, deal: 4000, streak: 9 })
  })

  it('returns the same case when nothing changes', () => {
    const c = mergeCase(
      emptyCase(),
      [earned('first-sale', 'hard')],
      records({ bestDay: { value: 100, day: 1 } }),
      1,
    )
    expect(
      mergeCase(c, [earned('first-sale', 'easy')], records({ bestDay: { value: 50, day: 2 } }), 2),
    ).toBe(c)
  })
})

describe('parseCase', () => {
  it('round-trips a case', () => {
    const c = mergeCase(
      emptyCase(),
      [earned('closer', 'hard'), earned('first-sale', 'easy')],
      records({ bestDay: { value: 100, day: 1 } }),
      42,
    )
    expect(parseCase(JSON.parse(JSON.stringify(c)))).toEqual(c)
  })

  it('drops unknown ids and badly formed entries', () => {
    const c = parseCase({
      earned: {
        'first-sale': { first: 10, level: 'hard' },
        'no-such-thing': { first: 10, level: 'hard' },
        closer: { first: 'yesterday', level: 'hard' },
        'full-sticker': { first: 10, level: 'impossible' },
        'big-ticket': null,
      },
      best: { day: 500, week: -3, month: 'lots', deal: NaN },
    })
    expect(Object.keys(c.earned)).toEqual(['first-sale'])
    expect(c.best).toEqual({ day: 500, week: 0, month: 0, deal: 0, streak: 0 })
  })

  it('gives an empty case for junk', () => {
    expect(parseCase(null)).toEqual(emptyCase())
    expect(parseCase('trophies')).toEqual(emptyCase())
    expect(parseCase({ earned: 7 })).toEqual(emptyCase())
  })

  it('counts against the whole catalogue', () => {
    const all = ACHIEVEMENTS.map((a) => earned(a.id, 'medium'))
    expect(caseCount(mergeCase(emptyCase(), all, emptyRecords(), 1))).toBe(ACHIEVEMENTS.length)
  })
})
