import { describe, expect, it } from 'vitest'
import {
  groupByPhase,
  LATEST_NEWS,
  legacyNews,
  UPDATES,
  updatesSince,
  type Update,
} from './whatsNew'

const update = (id: number, phase: string): Update => ({ id, phase, title: 't', items: ['i'] })

describe('the update log', () => {
  it('counts ids up by 1 from 1, ending at the latest news', () => {
    expect(UPDATES.map((u) => u.id)).toEqual(UPDATES.map((_, i) => i + 1))
    expect(LATEST_NEWS).toBe(UPDATES.length)
  })

  it('gives every update a phase, a title and short items', () => {
    for (const u of UPDATES) {
      expect(u.phase).not.toBe('')
      expect(u.title).not.toBe('')
      expect(u.items.length).toBeGreaterThan(0)
      for (const item of u.items) expect(item.length).toBeLessThanOrEqual(120)
    }
  })

  it('lists nothing when up to date, and everything newest first from nothing', () => {
    expect(updatesSince(LATEST_NEWS)).toEqual([])
    expect(updatesSince(0)).toEqual([...UPDATES].reverse())
    expect(updatesSince(LATEST_NEWS - 2).map((u) => u.id)).toEqual([LATEST_NEWS, LATEST_NEWS - 1])
  })

  it('groups a phase’s updates together, in order', () => {
    const groups = groupByPhase([
      update(5, '14'),
      update(4, '14'),
      update(3, '13'),
      update(2, '12'),
    ])
    expect(groups.map((g) => [g.phase, g.updates.map((u) => u.id)])).toEqual([
      ['14', [5, 4]],
      ['13', [3]],
      ['12', [2]],
    ])
    expect(groupByPhase([])).toEqual([])
  })
})

describe('news for saves from before it was kept', () => {
  it('covers every version from 2 up to the one that added it, never going down', () => {
    let last = 0
    // v14 added the news to the save.
    for (let v = 2; v < 14; v++) {
      const news = legacyNews(v)
      expect(news).toBeGreaterThanOrEqual(last)
      expect(news).toBeLessThan(LATEST_NEWS)
      last = news
    }
    expect(legacyNews(2)).toBe(0)
    expect(legacyNews(13)).toBe(9)
  })

  it('shows an unknown version everything', () => {
    expect(legacyNews(1)).toBe(0)
    expect(legacyNews(99)).toBe(0)
  })
})
