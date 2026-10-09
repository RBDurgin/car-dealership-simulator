import { describe, expect, it } from 'vitest'
import { CLOSE_MINUTE, startOfDay } from './clock'
import { generateCustomer, type Customer } from './customers'
import { nextEvent } from './events'
import { buildInventory } from './inventory'
import { NAZMA_ID, type NazmaVisit } from './nazma'
import { emptyCareer, TOP_RANK } from './progression'
import { createRng } from './rng'
import {
  allowCue,
  CLICK_YIELD_MS,
  POP_YIELD_MS,
  SFX_FAR,
  SFX_FAR_GAIN,
  SFX_MIN_GAP_MS,
  SFX_NEAR,
  sfxFor,
  spatialMix,
  type SfxCue,
  type SfxState,
} from './sfxEvents'
import { generateCandidates } from './staff'

const inventory = buildInventory(createRng(42))
const [hireable] = generateCandidates(createRng(3), 1)
const customer = (id: string, patch: Partial<Customer> = {}): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  ...patch,
})

const base: SfxState = {
  screen: 'playing',
  clock: startOfDay(1),
  customers: [customer('c1', { phase: 'talking' })],
  inventory,
  roster: [],
  orders: [],
  campaigns: [],
  improvements: [],
  career: emptyCareer(),
  notice: null,
  staffOpen: false,
  stockOpen: false,
  helpOpen: false,
  audioOpen: false,
  inspectedId: null,
  nazma: null,
}
const cues = (next: Partial<SfxState>, prev: Partial<SfxState> = {}) =>
  sfxFor({ ...base, ...prev }, { ...base, ...next }).map((e) => e.cue)

describe('sfxFor', () => {
  const car = { model: 'suv' as const, year: 2018, miles: 90_000, condition: 0.5, acquiredDay: 1 }
  const driving = customer('d1', { phase: 'arriving', vehicle: { car, spot: 2, parked: false } })
  const parked = { ...driving, phase: 'browsing' as const, vehicle: { car, spot: 2, parked: true } }
  const vehicle = { kind: 'vehicle', id: 'd1', spot: 2 }

  it('hears a driver come up the road, get out and drive off', () => {
    const arrive = sfxFor(base, { ...base, customers: [...base.customers, driving] })
    expect(arrive).toContainEqual({ cue: 'chime', subject: { kind: 'customer', id: 'd1' } })
    expect(arrive).toContainEqual({ cue: 'engine', subject: vehicle })
    expect(cues({ customers: [parked] }, { customers: [driving] })).toEqual(['door'])
    const leaving = { ...parked, phase: 'leaving' as const, leaveReason: 'closing' as const }
    expect(sfxFor({ ...base, customers: [leaving] }, { ...base, customers: [] })).toEqual([
      { cue: 'door', subject: vehicle },
      { cue: 'engine', subject: vehicle },
    ])
  })

  it('rings up a car we bought, and the seller walks off without driving', () => {
    const talking = { ...parked, phase: 'considering' as const }
    const sold = {
      ...parked,
      phase: 'leaving' as const,
      leaveReason: 'sold' as const,
      vehicle: null,
    }
    expect(cues({ customers: [sold] }, { customers: [talking] })).toEqual(['coin'])
    expect(cues({ customers: [] }, { customers: [sold] })).toEqual([])
  })

  it('has no door to shut for a driver who never got out', () => {
    const leaving = { ...driving, phase: 'leaving' as const, leaveReason: 'closing' as const }
    expect(cues({ customers: [] }, { customers: [leaving] })).toEqual(['engine'])
  })

  it('is quiet when someone on foot walks off', () => {
    const leaving = customer('w1', { phase: 'leaving', leaveReason: 'closing' })
    expect(cues({ customers: [] }, { customers: [leaving] })).toEqual([])
  })

  it('is quiet when nothing it listens to changed', () => {
    expect(sfxFor(base, { ...base })).toEqual([])
    expect(cues({ clock: { day: 1, minute: 700 } })).toEqual([])
  })

  it('is quiet on the title screen', () => {
    expect(cues({ screen: 'title', orders: [{}] }, { screen: 'title' })).toEqual([])
  })

  it('only rings the bell when a game starts, whatever the save brought with it', () => {
    const loaded = { roster: [hireable], orders: [{}], improvements: [{}], notice: { id: 4 } }
    expect(cues(loaded, { screen: 'title' })).toEqual(['bell'])
  })

  it('rings the bell on a new morning', () => {
    expect(cues({ clock: startOfDay(2) })).toEqual(['bell'])
  })

  it('opens a sale weekend with a fanfare instead', () => {
    const { day } = nextEvent(1)
    expect(cues({ clock: startOfDay(day) }, { clock: startOfDay(day - 1) })).toEqual(['fanfare'])
  })

  it('opens the morning Nazma goes bust with a fanfare instead', () => {
    const beaten = { ...emptyCareer(), rivalsBeaten: 1 }
    expect(cues({ clock: startOfDay(2), career: beaten })).toEqual(['fanfare'])
  })

  it('plays a fanfare on reaching the top rank, once', () => {
    const top = { ...emptyCareer(), rank: TOP_RANK.id }
    const before = { ...emptyCareer(), rank: 'regional-name' as const }
    expect(cues({ career: top }, { career: before })).toEqual(['fanfare'])
    expect(cues({ career: top }, { career: top })).toEqual([])
  })

  it('turns the page when the day summary comes up', () => {
    const closed = { clock: { day: 1, minute: CLOSE_MINUTE } }
    expect(cues({ ...closed, customers: [] }, closed)).toEqual(['paper'])
    expect(cues({ ...closed, customers: [] }, { ...closed, customers: [] })).toEqual([])
  })

  it('chimes at the customer who arrived', () => {
    const arrived = customer('c2')
    const events = sfxFor(base, { ...base, customers: [...base.customers, arrived] })
    expect(events).toEqual([{ cue: 'chime', subject: { kind: 'customer', id: 'c2' } }])
  })

  it('plays the sale where the buyer signed, once', () => {
    const bought = customer('c1', { phase: 'leaving', leaveReason: 'bought' })
    const events = sfxFor(base, { ...base, customers: [bought] })
    expect(events).toEqual([{ cue: 'sale', subject: { kind: 'customer', id: 'c1' } }])
    expect(cues({ customers: [bought] }, { customers: [bought] })).toEqual([])
  })

  it('thuds when a customer walks out upset, but not at closing', () => {
    for (const leaveReason of ['refused', 'impatient'] as const) {
      expect(cues({ customers: [customer('c1', { phase: 'leaving', leaveReason })] })).toEqual([
        'thud',
      ])
    }
    expect(
      cues({ customers: [customer('c1', { phase: 'leaving', leaveReason: 'closing' })] }),
    ).toEqual([])
  })

  it('says nothing for a customer who left the lot', () => {
    expect(cues({ customers: [] })).toEqual([])
  })

  it('sprays the car that got cleaner, not the ones that got dirtier', () => {
    const [a, b] = inventory
    const prev = inventory.map((c) => ({ ...c, cleanliness: 0.5 }))
    const next = prev.map((c) =>
      c.id === a.id ? { ...c, cleanliness: 1 } : c.id === b.id ? { ...c, cleanliness: 0.4 } : c,
    )
    const events = sfxFor({ ...base, inventory: prev }, { ...base, inventory: next })
    expect(events).toEqual([{ cue: 'spray', subject: { kind: 'car', id: a.id } }])
  })

  it('scuffs the car Nazma dirtied, and shoos him when he is run off', () => {
    const [a, b] = inventory
    const visit: NazmaVisit = {
      scheme: 'smudge',
      targets: [a.id, b.id],
      arrivalMinute: 600,
      status: 'onLot',
      progress: 0,
      chatting: false,
    }
    const dirtied = inventory.map((c) => (c.id === a.id ? { ...c, cleanliness: 0.4 } : c))
    const smudged = sfxFor(
      { ...base, nazma: visit },
      { ...base, nazma: { ...visit, progress: 1 }, inventory: dirtied },
    )
    expect(smudged).toEqual([{ cue: 'scuff', subject: { kind: 'car', id: a.id } }])
    // A car he skipped (sold, or out of reach) makes no sound.
    expect(cues({ nazma: { ...visit, progress: 1 } }, { nazma: visit })).toEqual([])
    expect(
      sfxFor({ ...base, nazma: visit }, { ...base, nazma: { ...visit, status: 'runOff' } }),
    ).toEqual([{ cue: 'shoo', subject: { kind: 'ambient', id: NAZMA_ID } }])
    expect(cues({ nazma: { ...visit, status: 'done' } }, { nazma: visit })).toEqual([])
  })

  it('stamps a hire and a firing, but not a shift change', () => {
    expect(cues({ roster: [hireable] })).toEqual(['stamp'])
    const fired = { ...hireable, fired: true }
    expect(cues({ roster: [fired] }, { roster: [hireable] })).toEqual(['stamp'])
    const arrived = { ...hireable, status: 'atPost' as const }
    expect(cues({ roster: [arrived] }, { roster: [hireable] })).toEqual([])
  })

  it('jingles coins for an order, an ad or an upgrade bought, not for one dropped', () => {
    expect(cues({ orders: [{}] })).toEqual(['coin'])
    expect(cues({ campaigns: [{}] })).toEqual(['coin'])
    expect(cues({ improvements: [{}] })).toEqual(['coin'])
    expect(cues({ orders: [] }, { orders: [{}] })).toEqual([])
  })

  it('pops a new notice, not one clearing', () => {
    expect(cues({ notice: { id: 2 } }, { notice: { id: 1 } })).toEqual(['pop'])
    expect(cues({ notice: null }, { notice: { id: 1 } })).toEqual([])
  })

  it('opens and closes panels', () => {
    expect(cues({ staffOpen: true })).toEqual(['open'])
    expect(cues({ inspectedId: 'lot-car-1' })).toEqual(['open'])
    expect(cues({ helpOpen: false }, { helpOpen: true })).toEqual(['close'])
    // Swapping one panel for another sounds like opening.
    expect(cues({ stockOpen: true }, { staffOpen: true })).toEqual(['open'])
  })
})

describe('allowCue', () => {
  it('holds a cue back until its gap has passed', () => {
    const last = new Map<SfxCue, number>()
    expect(allowCue(last, 'chime', 1000)).toBe(true)
    expect(allowCue(last, 'chime', 1000 + SFX_MIN_GAP_MS.chime - 1)).toBe(false)
    expect(allowCue(last, 'chime', 1000 + SFX_MIN_GAP_MS.chime)).toBe(true)
  })

  it('keeps each cue to its own gap', () => {
    const last = new Map<SfxCue, number>()
    expect(allowCue(last, 'chime', 0)).toBe(true)
    expect(allowCue(last, 'thud', 1)).toBe(true)
  })

  it("drops a notice's pop when a bigger sound just played for it", () => {
    const last = new Map<SfxCue, number>()
    allowCue(last, 'sale', 0)
    expect(allowCue(last, 'pop', 10)).toBe(false)
    expect(allowCue(last, 'pop', POP_YIELD_MS)).toBe(true)
    const clicked = new Map<SfxCue, number>()
    allowCue(clicked, 'open', 0)
    expect(allowCue(clicked, 'pop', 10)).toBe(true)
  })
})

describe('allowCue for clicks', () => {
  it("drops a button's click when it opened or closed a panel", () => {
    const last = new Map<SfxCue, number>()
    allowCue(last, 'open', 0)
    expect(allowCue(last, 'click', 5)).toBe(false)
    expect(allowCue(last, 'click', CLICK_YIELD_MS)).toBe(true)
  })
})

describe('spatialMix', () => {
  const origin = { x: 0, z: 0 }

  it('plays nearby sounds at full volume, centred', () => {
    expect(spatialMix(origin, 0, origin)).toEqual({ gain: 1, pan: 0 })
    expect(spatialMix(origin, 0, { x: 0, z: SFX_NEAR }).gain).toBe(1)
  })

  it('fades with distance down to a floor', () => {
    const mid = spatialMix(origin, 0, { x: 0, z: (SFX_NEAR + SFX_FAR) / 2 }).gain
    expect(mid).toBeLessThan(1)
    expect(mid).toBeGreaterThan(SFX_FAR_GAIN)
    expect(spatialMix(origin, 0, { x: 0, z: SFX_FAR * 3 }).gain).toBeCloseTo(SFX_FAR_GAIN)
  })

  it('pans by where the sound is on screen, turning with the camera', () => {
    const east = { x: 10, z: 0 }
    expect(spatialMix(origin, 0, east).pan).toBeGreaterThan(0)
    // A half turn puts east on the left.
    expect(spatialMix(origin, Math.PI, east).pan).toBeLessThan(0)
    // A quarter turn puts it straight ahead or behind: centred.
    expect(spatialMix(origin, Math.PI / 2, east).pan).toBeCloseTo(0)
  })

  it('never pans hard into one ear', () => {
    const { pan } = spatialMix(origin, 0, { x: 1000, z: 0 })
    expect(pan).toBeGreaterThan(0.5)
    expect(pan).toBeLessThan(1)
  })
})
