import { describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE, startOfDay } from './clock'
import { isMuffled, NOON_MINUTE, RUSH_MINUTE, trackFor, type MusicState } from './musicPlan'

const base: MusicState = {
  screen: 'playing',
  clock: startOfDay(1),
  customers: [],
  helpOpen: false,
  rotatePrompt: false,
}
const at = (minute: number, patch: Partial<MusicState> = {}): MusicState => ({
  ...base,
  clock: { day: 1, minute },
  ...patch,
})

describe('trackFor', () => {
  it('plays the title track on the title screen, whatever the clock says', () => {
    expect(trackFor(at(OPEN_MINUTE, { screen: 'title' }))).toBe('title')
    expect(trackFor(at(CLOSE_MINUTE, { screen: 'title' }))).toBe('title')
  })

  it('follows the day parts: morning, afternoon from noon, the rush from 17:00', () => {
    expect(trackFor(at(OPEN_MINUTE))).toBe('morning')
    expect(trackFor(at(NOON_MINUTE - 0.5))).toBe('morning')
    expect(trackFor(at(NOON_MINUTE))).toBe('afternoon')
    expect(trackFor(at(RUSH_MINUTE - 10))).toBe('afternoon')
    expect(trackFor(at(RUSH_MINUTE))).toBe('closing')
  })

  it('keeps the rush going after closing until the last customer leaves', () => {
    expect(trackFor(at(CLOSE_MINUTE, { customers: [{}] }))).toBe('closing')
    expect(trackFor(at(CLOSE_MINUTE))).toBe('summary')
  })

  it('starts the next day on the morning track', () => {
    expect(trackFor({ ...base, clock: startOfDay(2) })).toBe('morning')
  })
})

describe('isMuffled', () => {
  it('muffles behind the guide and the rotate prompt only', () => {
    expect(isMuffled(base)).toBe(false)
    expect(isMuffled({ ...base, helpOpen: true })).toBe(true)
    expect(isMuffled({ ...base, rotatePrompt: true })).toBe(true)
  })
})
