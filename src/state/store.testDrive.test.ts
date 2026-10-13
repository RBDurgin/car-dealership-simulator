import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_MINUTE, OPEN_MINUTE } from '../sim/clock'
import { PLAYER_ID, type Customer } from '../sim/customers'
import { availableCars } from '../sim/inventory'
import { MANAGER_DESK } from '../sim/layout'
import { dealWarmth, type AskResponse } from '../sim/negotiation'
import { freeSlots } from '../sim/ordering'
import { createSave } from '../sim/save'
import { topicFit, UNANSWERED } from '../sim/talkingPoints'
import { DRIVE_BONUS, driveScore, NO_DRIVE_PENALTY, POINT_SCORE } from '../sim/testDrive'
import { sellerBonusFor } from './derived'
import { useGame } from './store'

// Customers' answers are random; these tests take the bonus they're given.
const asked = vi.hoisted(() => ({ bonuses: [] as number[] }))
vi.mock('../sim/negotiation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sim/negotiation')>()),
  respondToAsk: (_c: Customer, _car: unknown, _ask: number, _rng: unknown, bonus: number) => {
    asked.bonuses.push(bonus)
    return { answer: 'walk', reason: 'pass' } as AskResponse
  },
}))

const initial = useGame.getState()
const game = () => useGame.getState()
const customer = () => game().customers.find((c) => c.id === 'customer-a')!
const car = (id = 'lot-car-1') => game().inventory.find((c) => c.id === id)!

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
  handlerId: PLAYER_ID,
  chairId: null,
  sellerId: PLAYER_ID,
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

/** Sets off on the drive and gets in, as the walk and the timer would. */
function setOff() {
  game().testDrive('customer-a')
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

describe('test drives in the store', () => {
  beforeEach(() => {
    useGame.setState(
      { ...initial, screen: 'playing', customers: [shopper()], clock: { day: 1, minute: 600 } },
      true,
    )
    asked.bonuses = []
  })

  it('takes the car out and heads for it, the shopper walking along', () => {
    game().testDrive('customer-a')
    expect(customer().phase).toBe('talking')
    expect(customer().drive).toMatchObject({ carId: 'lot-car-1', by: PLAYER_ID, back: false })
    expect(car().status).toBe('out')
    expect(game().activeAction).toMatchObject({ targetId: 'lot-car-1', action: 'ride' })
  })

  it('drives off once the player gets in, and the player is off the floor', () => {
    setOff()
    expect(customer().phase).toBe('driving')
    game().issueMoveOrder(5, 5)
    expect(game().moveOrder).toBeNull()
    game().requestAction('coffee-machine', 'getCoffee')
    expect(game().activeAction).toBeNull()
    expect(game().notice?.text).toMatch(/test drive/)
    // Walking off (or anything else) can't end the drive.
    game().walkAway()
    game().letWait()
    expect(customer().phase).toBe('driving')
  })

  it('heads back early on Esc, and counts the drive when it’s back', () => {
    setOff()
    game().cancelAll()
    expect(customer().drive?.cut).toBe(true)
    game().driveBack('customer-a')
    expect(customer().phase).toBe('talking')
    expect(customer().drive?.back).toBe(true)
    expect(car().status).toBe('available')
    expect(game().dayStats.drives).toMatchObject({ taken: 1, bought: 0, cut: 1, byStaff: 0 })
  })

  it('calls the drive off, and brings the car back, when the player walks off first', () => {
    game().testDrive('customer-a')
    game().walkAway()
    expect(customer()).toMatchObject({ phase: 'waiting', drive: null })
    expect(car().status).toBe('available')
  })

  it('can’t sell, browse or order over a car that’s out', () => {
    setOff()
    expect(availableCars(game().inventory).some((c) => c.id === 'lot-car-1')).toBe(false)
    expect(game().sellCar('lot-car-1')).toBe(false)
    const slots = freeSlots(game().inventory, [])
    const space = car().spaceIndex
    expect(slots.some((s) => s.location === 'lot' && s.index === space)).toBe(false)
    // Saved as back on the lot.
    const saved = createSave(game(), 0).inventory.find((c) => c.id === 'lot-car-1')
    expect(saved?.status).toBe('available')
  })

  it('makes a shopper keener after the drive, and a little cooler without the one they wanted', () => {
    const before = sellerBonusFor(game(), customer())
    const plain = sellerBonusFor(game(), { ...customer(), wantsDrive: false })
    expect(before).toBeCloseTo(plain - NO_DRIVE_PENALTY)
    setOff()
    game().driveBack('customer-a')
    const after = sellerBonusFor(game(), customer())
    expect(after - plain).toBeGreaterThanOrEqual(DRIVE_BONUS.min - 1e-9)
    expect(after - plain).toBeLessThanOrEqual(DRIVE_BONUS.max + 1e-9)
    expect(customer().expect).toBeLessThan(0.06)
    // The bonus reaches their answer and Easy's warmth chip.
    game().ask(car().msrp)
    game().answerOffer('customer-a')
    expect(asked.bonuses[0]).toBeCloseTo(after)
    const c = shopper({ wantsDrive: false })
    const price = car().msrp
    const order = ['cold', 'warm', 'hot']
    expect(order.indexOf(dealWarmth(c, car(), price, after, undefined, 1))).toBeGreaterThanOrEqual(
      order.indexOf(dealWarmth(c, car(), price, before, undefined, 1)),
    )
  })

  it('brings everyone back at closing, the car to its space', () => {
    useGame.setState({ clock: { day: 1, minute: CLOSE_MINUTE - 10 } })
    setOff()
    game().tickClock({ day: 1, minute: CLOSE_MINUTE })
    expect(customer()).toMatchObject({ phase: 'leaving', leaveReason: 'closing' })
    expect(car().status).toBe('available')
  })

  it('counts a buyer who drove first', () => {
    useGame.setState({ clock: { day: 1, minute: OPEN_MINUTE + 60 } })
    setOff()
    game().driveBack('customer-a')
    useGame.setState({
      customers: [
        { ...customer(), phase: 'signing', offer: { carId: 'lot-car-1', price: car().msrp } },
      ],
    })
    game().requestAction(MANAGER_DESK.chairId, 'closeDeal')
    const id = game().activeAction!.id
    game().arriveAction(id)
    game().completeAction(id)
    game().fiSign()
    expect(game().dayStats.drives.bought).toBe(1)
  })

  it('puts up two talking points a drive, and a good one makes it a better drive', () => {
    setOff()
    game().drivePrompt('customer-a')
    const offered = customer().drive!.offered!
    expect(offered).toHaveLength(3)
    // A regular in a sedan: the good fit among those offered.
    const good = offered.findIndex((t) => topicFit(customer(), car(), t) === 'good')
    game().pickTopic(good)
    expect(customer().drive).toMatchObject({ offered: null, points: [{ fit: 'good' }] })
    game().drivePrompt('customer-a')
    game().drivePrompt('customer-a')
    // Two a drive: the third does nothing, and the second is left open.
    expect(customer().drive!.points).toHaveLength(1)
    expect(customer().drive!.offered).not.toBeNull()
    // Scored on the car as it was on the road, before the mud it brings back.
    const before = car()
    game().driveBack('customer-a')
    const drive = customer().drive!
    expect(drive.points).toEqual([expect.objectContaining({ fit: 'good' }), UNANSWERED])
    expect(drive.score).toBeCloseTo(
      driveScore({ points: [], cut: false }, customer(), before) +
        POINT_SCORE.good +
        POINT_SCORE.ok,
    )
  })

  it('puts up no talking points once heading back, and takes 1–3 only with one up', () => {
    setOff()
    game().pickTopic(0)
    expect(customer().drive!.points).toEqual([])
    game().headBack()
    game().drivePrompt('customer-a')
    expect(customer().drive!.offered).toBeNull()
  })
})
