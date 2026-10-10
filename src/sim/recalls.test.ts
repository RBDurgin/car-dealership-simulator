import { describe, expect, it } from 'vitest'
import { calendarOf, DAYS_PER_MONTH } from './calendar'
import { carName } from './interactables'
import {
  dayOrdinal,
  inRecallWindow,
  RECALL_CHANCE,
  RECALL_FIRST,
  RECALL_LAST,
  RECALL_RESPONSE,
  recallDemand,
  recallExpected,
  recallNotice,
  recallOfMonth,
  recallOn,
  recallStarts,
} from './recalls'

/** The first day of the first month from `from` on with a recall. */
function recallMonth(from = 1): number {
  for (let day = from; ; day += DAYS_PER_MONTH) if (recallOfMonth(day)) return day
}
const first = recallMonth()
const start = first + RECALL_FIRST - 1
const recall = recallOfMonth(first)!

describe('recalls', () => {
  it('pick the same recall for every day of a month', () => {
    for (let d = first; d < first + DAYS_PER_MONTH; d++) expect(recallOfMonth(d)).toEqual(recall)
    expect(recallOfMonth(first)).toEqual(recallOfMonth(first))
  })

  it('come in about RECALL_CHANCE of the months', () => {
    const months = 300
    let n = 0
    for (let m = 0; m < months; m++) if (recallOfMonth(1 + m * DAYS_PER_MONTH)) n++
    expect(n / months).toBeGreaterThan(RECALL_CHANCE - 0.1)
    expect(n / months).toBeLessThan(RECALL_CHANCE + 0.1)
  })

  it('run from the 8th to the 28th, and only with a garage', () => {
    expect(recallOn(start - 1, 2)).toBeNull()
    expect(recallOn(start, 2)).toEqual(recall)
    expect(recallOn(first + RECALL_LAST - 1, 2)).toEqual(recall)
    expect(recallOn(start, 0)).toBeNull()
    expect(inRecallWindow(start)).toBe(true)
    expect(calendarOf(start).dayOfMonth).toBe(RECALL_FIRST)
  })

  it('start on the 8th, or the morning the garage first opens during one', () => {
    expect(recallStarts(start, 2, 2)).toBe(true)
    expect(recallStarts(start + 1, 2, 2)).toBe(false)
    expect(recallStarts(start + 5, 2, 0)).toBe(true)
    expect(recallStarts(start, 0, 0)).toBe(false)
  })

  it('bring in about a quarter of the model’s buyers over the window, none on Sundays', () => {
    const career = { soldByModel: { [recall.model]: 40 } }
    let total = 0
    for (let d = start; d <= first + RECALL_LAST - 1; d++) {
      const n = recallDemand(d, career, 2)
      if (calendarOf(d).weekday === 6) expect(n).toBe(0)
      total += n
    }
    expect(total).toBeCloseTo(40 * RECALL_RESPONSE)
    expect(recallExpected(40)).toBe(10)
  })

  it('bring nobody in without a garage, outside the window, or with none of the model sold', () => {
    const career = { soldByModel: { [recall.model]: 40 } }
    const monday = start + ((7 - calendarOf(start).weekday) % 7)
    expect(recallDemand(monday, career, 2)).toBeGreaterThan(0)
    expect(recallDemand(monday, career, 0)).toBe(0)
    expect(recallDemand(start - 1, career, 2)).toBe(0)
    expect(recallDemand(monday, { soldByModel: {} }, 2)).toBe(0)
  })

  it('are announced with the model, the issue and how many to expect', () => {
    const text = recallNotice(recall, 36)
    expect(text).toContain(carName(recall.model))
    expect(text).toContain(recall.issue)
    expect(text).toContain('about 9')
    expect(recallNotice(recall, 0)).toContain("haven't sold any")
  })

  it('write days of the month as ordinals', () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 28].map(dayOrdinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '8th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '28th',
    ])
  })
})
