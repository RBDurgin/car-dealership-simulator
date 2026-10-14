import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DING_PENALTY } from '../sim/cleanliness'
import { acceptChance, PLAYER_ID, type Customer } from '../sim/customers'
import type { OwnedExpansion } from '../sim/expansions'
import { createSave } from '../sim/save'
import { GARAGE_EXPANSION, JOBS } from '../sim/service'
import { wageFor, type Employee, type Role } from '../sim/staff'
import { DRIVE_DIRT } from '../sim/testDrive'
import { rng } from './rng'
import { useGame } from './store'

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = () => game().customers.find((c) => c.id === 'customer-a')!
const car = (id = 'lot-car-1') => game().inventory.find((c) => c.id === id)!

const staff = (id: string, role: Role, skill = 3): Employee => ({
  id,
  name: `${id} K.`,
  variant: 'male-c',
  role,
  skill,
  wage: wageFor(role, skill),
  status: 'atPost',
  fired: false,
  quitting: false,
  xp: 0,
  potential: 5,
  hiredDay: 1,
  raiseAsk: null,
})
const sam = staff('sam', 'sales', 5)

const shopper = (extra: Partial<Customer> = {}): Customer => ({
  id: 'customer-a',
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 200_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: ['lot-car-1'],
  browsed: 1,
  targetCarId: 'lot-car-1',
  offer: null,
  expect: 0.06,
  haggle: null,
  phase: 'talking',
  leaveReason: null,
  handlerId: 'sam',
  chairId: null,
  sellerId: 'sam',
  vehicle: null,
  selling: null,
  trade: null,
  rivalQuote: null,
  clientId: null,
  loyaltyCut: 0,
  referredBy: null,
  guest: false,
  credit: null,
  fi: null,
  wantsDrive: true,
  drive: null,
  service: null,
  ...extra,
})

const garage: OwnedExpansion[] = [
  { id: 'east-lot', day: 1 },
  { id: GARAGE_EXPANSION, day: 1 },
]

describe('salespeople’s test drives', () => {
  beforeEach(() => {
    useGame.setState(
      {
        ...initial,
        screen: 'playing',
        customers: [shopper()],
        roster: [sam],
        weather: 'sunny',
        clock: { day: 1, minute: 600 },
      },
      true,
    )
  })

  it('takes a shopper out, picks the talking points and brings them back', () => {
    game().staffTestDrive('sam')
    expect(customer().drive).toMatchObject({ carId: 'lot-car-1', by: 'sam', back: false })
    expect(car().status).toBe('out')
    game().staffBoard('sam')
    expect(customer().phase).toBe('driving')
    game().drivePrompt('customer-a')
    game().drivePrompt('customer-a')
    // The salesperson answers each prompt at once.
    expect(customer().drive!.points).toHaveLength(2)
    expect(customer().drive!.offered).toBeNull()
    game().drivePrompt('customer-a')
    expect(customer().drive!.points).toHaveLength(2)
    game().driveBack('customer-a')
    expect(customer()).toMatchObject({ phase: 'talking', handlerId: 'sam' })
    expect(customer().drive!.back).toBe(true)
    expect(car().status).toBe('available')
    // Only the player's drives count as perfect.
    expect(game().dayStats.drives).toMatchObject({ taken: 1, byStaff: 1, perfect: 0 })
  })

  it('takes only a shopper who asked, once', () => {
    useGame.setState({ customers: [shopper({ wantsDrive: false })] })
    game().staffTestDrive('sam')
    expect(customer().drive).toBeNull()
    useGame.setState({ customers: [shopper({ handlerId: PLAYER_ID })] })
    game().staffTestDrive('sam')
    expect(customer().drive).toBeNull()
  })

  it('sends a shopper back to waiting if their salesperson was let go while out', () => {
    game().staffTestDrive('sam')
    game().staffBoard('sam')
    useGame.setState({ roster: [{ ...sam, fired: true, status: 'leaving' }] })
    game().driveBack('customer-a')
    expect(customer()).toMatchObject({ phase: 'waiting', handlerId: null })
    expect(customer().drive!.back).toBe(true)
  })

  it('hands the player’s 🔑 shopper to a free salesperson with Send with', () => {
    useGame.setState({ customers: [shopper({ handlerId: PLAYER_ID, sellerId: PLAYER_ID })] })
    game().sendWith('customer-a', 'sam')
    expect(customer()).toMatchObject({ handlerId: 'sam', sellerId: 'sam', phase: 'talking' })
    // Busy now: nobody else can be sent with them.
    useGame.setState({
      customers: [customer(), shopper({ id: 'customer-b', handlerId: PLAYER_ID })],
    })
    game().sendWith('customer-b', 'sam')
    expect(game().customers[1].handlerId).toBe(PLAYER_ID)
  })
})

describe('mud, miles and dings', () => {
  beforeEach(() => {
    useGame.setState(
      {
        ...initial,
        screen: 'playing',
        customers: [shopper()],
        roster: [sam],
        weather: 'rain',
        clock: { day: 1, minute: 600 },
      },
      true,
    )
  })

  const drive = () => {
    game().staffTestDrive('sam')
    game().staffBoard('sam')
    game().driveBack('customer-a')
  }

  it('brings the car back muddier in the rain', () => {
    useGame.setState({
      inventory: game().inventory.map((c) => (c.id === 'lot-car-1' ? { ...c, cleanliness: 1 } : c)),
    })
    drive()
    expect(car().cleanliness).toBeCloseTo(1 - DRIVE_DIRT.rain)
  })

  it('now and then brings it back with a ding, which puts buyers off until fixed', () => {
    const before = car()
    vi.spyOn(rng.wear, 'next').mockReturnValue(0)
    drive()
    vi.restoreAllMocks()
    expect(car().ding).toBe(true)
    expect(customer().drive!.ding).toBe(true)
    expect(game().dayStats.drives.dings).toBe(1)
    // Away from the cap, a dinged car is DING_PENALTY less likely to sell.
    const c = { ...customer(), preferredModels: [], budget: car().msrp }
    const cleanCar = { ...car(), ding: false }
    const price = car().msrp - 1000
    expect(acceptChance(c, cleanCar, price) - acceptChance(c, car(), price)).toBeCloseTo(
      DING_PENALTY,
    )
    expect(before.ding).toBe(false)
  })

  it('fixes a dent in the garage, and refuses without one', () => {
    useGame.setState({
      inventory: game().inventory.map((c) => (c.id === 'lot-car-1' ? { ...c, ding: true } : c)),
      cash: 50_000,
      customers: [],
    })
    expect(game().fixDing('lot-car-1')).toBe(false)
    // The garage built yesterday is up today.
    useGame.setState({
      expansions: garage,
      roster: [sam, staff('mech', 'mechanic')],
      clock: { day: 2, minute: 600 },
    })
    expect(game().fixDing('lot-car-1')).toBe(true)
    const job = game().serviceJobs[0]
    expect(job).toMatchObject({ kind: 'ding', carId: 'lot-car-1', status: 'waiting' })
    expect(job.partsCost).toBeGreaterThanOrEqual(JOBS.ding.parts.min)
    expect(job.partsCost).toBeLessThanOrEqual(JOBS.ding.parts.max)
    expect(game().cash).toBe(50_000 - job.partsCost)
    expect(car().status).toBe('recon')
    // The mechanic works it like any of our own cars.
    game().staffStartJob('mech', job.id, 0)
    game().tickClock({ day: 2, minute: 600 + 2 * JOBS.ding.minutes })
    expect(car()).toMatchObject({ ding: false, status: 'available', cleanliness: 1 })
  })

  it('keeps a ding through a save', () => {
    useGame.setState({
      inventory: game().inventory.map((c) => (c.id === 'lot-car-1' ? { ...c, ding: true } : c)),
      customers: [],
    })
    const save = JSON.parse(JSON.stringify(createSave(game(), 0)))
    useGame.setState(initial, true)
    game().loadGame(save)
    expect(car().ding).toBe(true)
  })
})
