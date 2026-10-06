import { describe, expect, it } from 'vitest'
import {
  companionId,
  conversationsOf,
  MAX_VOICES,
  nextLine,
  reactionsFor,
  variantOf,
  VOICE_FAR,
  VOICE_NEAR,
  voiceMix,
  type ChatterState,
} from './chatter'
import { OWNER_VARIANT } from './characters'
import { generateCustomer, PLAYER_ID, type Customer } from './customers'
import { buildInventory } from './inventory'
import { OWNER_ID } from './owner'
import { createRng } from './rng'
import { generateCandidates, type Employee } from './staff'

const inventory = buildInventory(createRng(42))
const customer = (id: string, patch: Partial<Customer> = {}): Customer => ({
  ...generateCustomer(id, inventory, createRng(1)),
  companion: null,
  ...patch,
})
const candidates = generateCandidates(createRng(3), 1)
const employee = (patch: Partial<Employee>): Employee => ({ ...candidates[0], ...patch })
const receptionist = employee({ id: 'e-rec', role: 'receptionist', status: 'atPost' })
const seller = employee({ id: 'e-sales', role: 'sales', status: 'atPost' })

const state = (patch: Partial<ChatterState> = {}): ChatterState => ({
  customers: [],
  roster: [],
  owner: null,
  ...patch,
})
const lines = (prev: ChatterState, next: ChatterState) => reactionsFor(prev, next, createRng(1))

describe('variantOf', () => {
  it('finds everyone who can speak', () => {
    const c = customer('c1', { variant: 'female-b', companion: 'male-a' })
    const s = state({ customers: [c], roster: [seller] })
    expect(variantOf(s, 'c1')).toBe('female-b')
    expect(variantOf(s, companionId('c1'))).toBe('male-a')
    expect(variantOf(s, 'e-sales')).toBe(seller.variant)
    expect(variantOf(s, PLAYER_ID)).toBe('salesperson')
    expect(variantOf(s, OWNER_ID)).toBe(OWNER_VARIANT)
    expect(variantOf(s, 'nobody')).toBeNull()
  })
})

describe('conversationsOf', () => {
  it('pairs a seller with the customer they are talking to, seller first', () => {
    const s = state({ customers: [customer('c1', { phase: 'talking', handlerId: PLAYER_ID })] })
    expect(conversationsOf(s)).toEqual([
      { key: 'pitch:c1', kind: 'pitch', speakers: [PLAYER_ID, 'c1'] },
    ])
  })

  it('murmurs at the desk while signing', () => {
    const s = state({ customers: [customer('c1', { phase: 'signing', handlerId: 'e-fin' })] })
    expect(conversationsOf(s)[0]).toMatchObject({ kind: 'signing', speakers: ['e-fin', 'c1'] })
  })

  it('lets a couple chat while they browse or wait, but not once they are being sold to', () => {
    const couple = (patch: Partial<Customer>) => customer('c1', { companion: 'male-a', ...patch })
    expect(conversationsOf(state({ customers: [couple({ phase: 'browsing' })] }))).toEqual([
      { key: 'couple:c1', kind: 'couple', speakers: ['c1', companionId('c1')] },
    ])
    expect(conversationsOf(state({ customers: [couple({ phase: 'waiting' })] }))).toHaveLength(1)
    expect(conversationsOf(state({ customers: [couple({ phase: 'leaving' })] }))).toEqual([])
    const talking = couple({ phase: 'talking', handlerId: PLAYER_ID })
    expect(conversationsOf(state({ customers: [talking] }))[0].kind).toBe('pitch')
  })

  it('is quiet for shoppers on their own', () => {
    expect(conversationsOf(state({ customers: [customer('c1', { phase: 'browsing' })] }))).toEqual(
      [],
    )
  })
})

describe('nextLine', () => {
  const pitch = conversationsOf(
    state({ customers: [customer('c1', { phase: 'talking', handlerId: 'e-sales' })] }),
  )[0]

  it('takes turns, the seller first', () => {
    const rng = createRng(2)
    const speakers = [0, 1, 2, 3].map((turn) => nextLine(pitch, turn, rng).line.speaker)
    expect(speakers).toEqual(['e-sales', 'c1', 'e-sales', 'c1'])
  })

  it('has the seller do most of the talking, and never question the customer', () => {
    const rng = createRng(7)
    for (let turn = 0; turn < 40; turn++) {
      const { line, gapMs } = nextLine(pitch, turn, rng)
      expect(gapMs).toBeGreaterThan(0)
      if (turn % 2 === 0) {
        expect(line.syllables).toBeGreaterThanOrEqual(3)
        expect(line.tone).not.toBe('question')
      } else expect(line.syllables).toBeLessThanOrEqual(5)
    }
  })

  it('murmurs while signing', () => {
    const signing = { ...pitch, kind: 'signing' as const }
    expect(nextLine(signing, 0, createRng(1)).line.tone).toBe('murmur')
  })

  it('leaves a long pause after each exchange between a couple', () => {
    const couple = {
      key: 'couple:c1',
      kind: 'couple' as const,
      speakers: ['c1', 'c1:companion'] as [string, string],
    }
    const rng = createRng(1)
    expect(nextLine(couple, 0, rng).gapMs).toBeLessThan(1000)
    expect(nextLine(couple, 1, rng).gapMs).toBeGreaterThan(5000)
  })
})

describe('reactionsFor', () => {
  it('has a greeter say hello, and the customer say it back', () => {
    const prev = state({ customers: [customer('c1', { phase: 'waiting' })] })
    const next = state({ customers: [customer('c1', { phase: 'talking', handlerId: PLAYER_ID })] })
    expect(lines(prev, next)).toEqual([
      [
        expect.objectContaining({ speaker: PLAYER_ID, tone: 'greeting' }),
        expect.objectContaining({ speaker: 'c1', tone: 'greeting' }),
      ],
    ])
  })

  it('has the receptionist welcome someone reaching the lot, if there is one at their post', () => {
    const prev = state({ customers: [customer('c1', { phase: 'arriving' })] })
    const arrived = [customer('c1', { phase: 'browsing' })]
    expect(lines(prev, state({ customers: arrived }))).toEqual([])
    expect(lines(prev, state({ customers: arrived, roster: [receptionist] }))).toEqual([
      [expect.objectContaining({ speaker: 'e-rec', tone: 'greeting' })],
    ])
    const away = { ...receptionist, status: 'arriving' as const }
    expect(lines(prev, state({ customers: arrived, roster: [away] }))).toEqual([])
  })

  it('hums over an offer, and asks when countering', () => {
    const talking = customer('c1', { phase: 'talking', handlerId: PLAYER_ID })
    const considering = { ...talking, phase: 'considering' as const }
    const countered = { ...talking, haggle: { round: 1, lastAsk: 20_000, counter: 18_000 } }
    expect(lines(state({ customers: [talking] }), state({ customers: [considering] }))).toEqual([
      [{ speaker: 'c1', tone: 'murmur', syllables: 1 }],
    ])
    expect(
      lines(state({ customers: [considering] }), state({ customers: [countered] }))[0][0].tone,
    ).toBe('question')
  })

  it('is happy on a yes, the seller too, and grumbles walking out', () => {
    const considering = customer('c1', { phase: 'considering', handlerId: 'e-sales' })
    const following = { ...considering, phase: 'following' as const }
    expect(
      lines(state({ customers: [considering] }), state({ customers: [following] }))[0].map((l) => [
        l.speaker,
        l.tone,
      ]),
    ).toEqual([
      ['c1', 'happy'],
      ['e-sales', 'happy'],
    ])
    for (const leaveReason of ['refused', 'impatient'] as const) {
      const left = { ...considering, phase: 'leaving' as const, leaveReason, handlerId: null }
      expect(
        lines(state({ customers: [considering] }), state({ customers: [left] }))[0][0].tone,
      ).toBe('grumble')
    }
    const bought = { ...following, phase: 'leaving' as const, leaveReason: 'bought' as const }
    expect(lines(state({ customers: [following] }), state({ customers: [bought] }))).toEqual([])
  })

  it('has the owner say hello and their piece on reaching the office', () => {
    const goal = { kind: 'sales' as const, count: 3 }
    const prev = state({ owner: { goal, announced: false } })
    const said = lines(prev, state({ owner: { goal, announced: true } }))
    expect(said[0].map((l) => [l.speaker, l.tone])).toEqual([
      [OWNER_ID, 'greeting'],
      [OWNER_ID, 'neutral'],
    ])
    expect(
      lines(
        state({ owner: { goal, announced: true } }),
        state({ owner: { goal, announced: true } }),
      ),
    ).toEqual([])
  })

  it('is quiet when nothing changed', () => {
    const s = state({ customers: [customer('c1')] })
    expect(lines(s, s)).toEqual([])
  })
})

describe('voiceMix', () => {
  const at = (x: number) => ({ x, z: 0 })
  it('is full up close, quieter further off and skipped out of earshot', () => {
    const near = voiceMix(at(0), 0, at(VOICE_NEAR))!
    const mid = voiceMix(at(0), 0, at((VOICE_NEAR + VOICE_FAR) / 2))!
    expect(near.gain).toBe(1)
    expect(mid.gain).toBeLessThan(1)
    expect(mid.gain).toBeGreaterThan(0)
    expect(voiceMix(at(0), 0, at(VOICE_FAR + 0.1))).toBeNull()
  })

  it('pans by where the speaker is on screen', () => {
    expect(voiceMix(at(0), 0, at(5))!.pan).toBeGreaterThan(0)
    expect(voiceMix(at(0), 0, at(-5))!.pan).toBeLessThan(0)
  })

  it('keeps the crowd small', () => {
    expect(MAX_VOICES).toBe(3)
  })
})
