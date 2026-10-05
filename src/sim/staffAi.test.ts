import { describe, expect, it } from 'vitest'
import { WASH_BELOW } from './cleanliness'
import { PLAYER_ID, type Customer } from './customers'
import { buildInventory, sellCar, type InventoryCar } from './inventory'
import { GUEST_CHAIR_ID, SALES_DESKS } from './layout'
import { createRng } from './rng'
import { wageFor, type Employee, type Role } from './staff'
import {
  EARLY_GREET_SKILL,
  leadChoice,
  nextPorterTask,
  nextSalesTask,
  pickSalesCustomer,
  salesChairFor,
} from './staffAi'

const shopper = (id: string, extra: Partial<Customer> = {}): Customer => ({
  id,
  name: 'Alex B.',
  variant: 'male-a',
  archetype: 'regular',
  source: 'regular',
  companion: null,
  budget: 40_000,
  preferredModels: ['sedan'],
  patience: 60,
  patienceLeft: 60,
  browseCarIds: ['lot-car-1'],
  browsed: 1,
  targetCarId: 'lot-car-1',
  offer: null,
  expect: 0.04,
  haggle: null,
  phase: 'waiting',
  leaveReason: null,
  handlerId: null,
  chairId: null,
  sellerId: null,
  ...extra,
})

const staff = (id: string, role: Role, over: Partial<Employee> = {}): Employee => ({
  id,
  name: `${id} K.`,
  variant: 'male-c',
  role,
  skill: 3,
  wage: wageFor(role, 3),
  status: 'atPost',
  fired: false,
  ...over,
})

const sam = staff('sam', 'sales')
const kim = staff('kim', 'sales')
const fm = staff('fm', 'finance')
const ctx = (roster: Employee[] = [sam], playerTargetId: string | null = null) => ({
  roster,
  playerTargetId,
})

describe('pickSalesCustomer', () => {
  it('goes to whoever has the least patience left, waiting before browsing', () => {
    const list = [
      shopper('a', { phase: 'browsing' }),
      shopper('b', { patienceLeft: 40 }),
      shopper('c', { patienceLeft: 20 }),
      shopper('d', { patienceLeft: 20 }),
    ]
    expect(pickSalesCustomer(list)?.id).toBe('c')
    expect(pickSalesCustomer(list, new Set(['c']))?.id).toBe('d')
    expect(pickSalesCustomer([shopper('a', { phase: 'browsing' })])?.id).toBe('a')
  })

  it('skips anyone being helped, mid-deal, arriving or leaving', () => {
    const list = [
      shopper('a', { handlerId: 'kim' }),
      shopper('b', { phase: 'talking', handlerId: PLAYER_ID }),
      shopper('c', { phase: 'arriving' }),
      shopper('d', { phase: 'leaving', leaveReason: 'impatient' }),
    ]
    expect(pickSalesCustomer(list)).toBeNull()
  })
})

describe('leadChoice', () => {
  const buyer = shopper('a', { phase: 'following', handlerId: 'sam' })

  it('hands off to finance when they are free, otherwise uses their own desk', () => {
    expect(leadChoice(sam, [buyer], [sam, fm])).toEqual({ kind: 'handOff' })
    const signing = shopper('b', { phase: 'signing', handlerId: 'fm', chairId: GUEST_CHAIR_ID })
    expect(leadChoice(sam, [buyer, signing], [sam, fm])).toEqual({
      kind: 'desk',
      chairId: SALES_DESKS[0].guestChairId,
    })
    expect(leadChoice(kim, [buyer], [sam, kim])).toEqual({
      kind: 'desk',
      chairId: SALES_DESKS[1].guestChairId,
    })
  })

  it('falls back on a busy finance desk, or nothing, without a desk of their own', () => {
    const extra = staff('extra', 'sales')
    const roster = [sam, kim, extra]
    const queued = shopper('b', { phase: 'queued', handlerId: 'fm' })
    expect(leadChoice(extra, [buyer, queued], [...roster, fm])).toEqual({ kind: 'handOff' })
    expect(leadChoice(extra, [buyer], roster)).toBeNull()
  })
})

describe('nextSalesTask', () => {
  it('picks a customer to greet when free and at work', () => {
    const list = [shopper('a'), shopper('b', { patienceLeft: 10 })]
    expect(nextSalesTask(sam, list, ctx())).toEqual({ kind: 'greet', customerId: 'b' })
    expect(nextSalesTask(sam, [], ctx())).toEqual({ kind: 'idle' })
  })

  it('lets newer salespeople wait until a browsing customer is at a car', () => {
    const browsing = [shopper('a', { phase: 'browsing' })]
    const novice = { ...sam, skill: EARLY_GREET_SKILL - 1 }
    const pro = { ...sam, skill: EARLY_GREET_SKILL }
    expect(nextSalesTask(novice, browsing, ctx([novice]))).toEqual({ kind: 'idle' })
    expect(nextSalesTask(novice, browsing, { ...ctx([novice]), atCar: new Set(['a']) })).toEqual({
      kind: 'greet',
      customerId: 'a',
    })
    expect(nextSalesTask(pro, browsing, ctx([pro]))).toEqual({ kind: 'greet', customerId: 'a' })
    // Anyone waiting is fair game, whatever the skill.
    expect(nextSalesTask(novice, [shopper('b')], ctx([novice])).kind).toBe('greet')
  })

  it("leaves alone the customer the player is heading to, and ones they've given up on", () => {
    const list = [shopper('a', { patienceLeft: 10 }), shopper('b')]
    expect(nextSalesTask(sam, list, ctx([sam], 'a'))).toEqual({ kind: 'greet', customerId: 'b' })
    const exclude = new Set(['a', 'b'])
    expect(nextSalesTask(sam, list, { ...ctx(), exclude })).toEqual({ kind: 'idle' })
  })

  it("doesn't start a deal on the way in, going home, let go, or with nowhere to close it", () => {
    const list = [shopper('a')]
    for (const e of [
      { ...sam, status: 'arriving' as const },
      { ...sam, status: 'leaving' as const },
      { ...sam, fired: true },
    ]) {
      expect(nextSalesTask(e, list, ctx([e]))).toEqual({ kind: 'idle' })
    }
    const extra = staff('extra', 'sales')
    expect(nextSalesTask(extra, list, ctx([sam, kim, extra]))).toEqual({ kind: 'idle' })
    expect(nextSalesTask(extra, list, ctx([sam, kim, extra, fm])).kind).toBe('greet')
  })

  it('follows the deal through from greeting to signing', () => {
    const task = (extra: Partial<Customer>) =>
      nextSalesTask(sam, [shopper('a', { handlerId: 'sam', ...extra })], ctx())
    expect(task({})).toEqual({ kind: 'greet', customerId: 'a' })
    expect(task({ phase: 'talking' })).toEqual({ kind: 'offer', customerId: 'a' })
    expect(task({ phase: 'considering' })).toEqual({ kind: 'offer', customerId: 'a' })
    expect(task({ phase: 'following' })).toEqual({ kind: 'lead', customerId: 'a' })
    const desk = SALES_DESKS[1]
    const sign = { kind: 'sign', customerId: 'a', chairId: desk.chairId }
    expect(task({ phase: 'following', chairId: desk.guestChairId })).toEqual(sign)
    expect(task({ phase: 'signing', chairId: desk.guestChairId })).toEqual(sign)
  })

  it('finishes a buyer in hand even when going home', () => {
    const leaving = { ...sam, status: 'leaving' as const }
    const buyer = shopper('a', { phase: 'following', handlerId: 'sam' })
    expect(nextSalesTask(leaving, [buyer], ctx([leaving]))).toEqual({
      kind: 'lead',
      customerId: 'a',
    })
  })

  it('is done with a buyer once finance has them', () => {
    const handedOff = shopper('a', { phase: 'queued', handlerId: 'fm', sellerId: 'sam' })
    expect(nextSalesTask(sam, [handedOff], ctx([sam, fm]))).toEqual({ kind: 'idle' })
  })
})

describe('salesChairFor', () => {
  it("finds the salesperson's chair across the desk from a guest chair", () => {
    for (const d of SALES_DESKS) expect(salesChairFor(d.guestChairId)).toBe(d.chairId)
    expect(salesChairFor(GUEST_CHAIR_ID)).toBeNull()
  })
})

describe('nextPorterTask', () => {
  const porter = staff('pat', 'porter')
  const stock = buildInventory(createRng(42))
  const withDirt = (dirt: Record<string, number>): InventoryCar[] =>
    stock.map((c) => (c.id in dirt ? { ...c, cleanliness: dirt[c.id] } : c))
  const dirty = withDirt({ 'lot-car-1': 0.5, 'lot-car-2': 0.2 })
  const none = { playerTargetId: null }

  it('washes the dirtiest car that needs it', () => {
    expect(nextPorterTask(porter, dirty, none)).toEqual({ kind: 'wash', carId: 'lot-car-2' })
  })

  it('waits when every car is clean enough', () => {
    expect(nextPorterTask(porter, stock, none)).toEqual({ kind: 'idle' })
    const fine = withDirt({ 'lot-car-1': WASH_BELOW })
    expect(nextPorterTask(porter, fine, none)).toEqual({ kind: 'idle' })
  })

  it('only works while at work', () => {
    for (const status of ['arriving', 'leaving', 'off'] as const) {
      expect(nextPorterTask({ ...porter, status }, dirty, none)).toEqual({ kind: 'idle' })
    }
    expect(nextPorterTask({ ...porter, fired: true }, dirty, none)).toEqual({ kind: 'idle' })
  })

  it("leaves the car the player is going to, and cars they couldn't reach", () => {
    const wash = (carId: string) => ({ kind: 'wash', carId })
    expect(nextPorterTask(porter, dirty, { playerTargetId: 'lot-car-2' })).toEqual(
      wash('lot-car-1'),
    )
    const exclude = new Set(['lot-car-2'])
    expect(nextPorterTask(porter, dirty, { ...none, exclude })).toEqual(wash('lot-car-1'))
  })

  it('finishes the car they started on, even if another gets dirtier', () => {
    const current = 'lot-car-1'
    expect(nextPorterTask(porter, dirty, { ...none, current })).toEqual({
      kind: 'wash',
      carId: 'lot-car-1',
    })
    // Done (washed), or sold: on to the next.
    const washed = withDirt({ 'lot-car-2': 0.2 })
    expect(nextPorterTask(porter, washed, { ...none, current })).toEqual({
      kind: 'wash',
      carId: 'lot-car-2',
    })
    expect(nextPorterTask(porter, sellCar(dirty, current), { ...none, current })).toEqual({
      kind: 'wash',
      carId: 'lot-car-2',
    })
  })
})
