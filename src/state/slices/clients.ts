import {
  appreciationBlocker,
  appreciationCost,
  monthIndex,
  nearlyDue,
  welcomeGuest,
} from '../../sim/appreciation'
import { longDate } from '../../sim/calendar'
import {
  appointmentMinute,
  applyCall,
  CALL_MINUTES,
  callKind,
  callLine,
  callList,
  callOutcome,
  callSkill,
  receptionCallTime,
  takeDueClients,
} from '../../sim/calls'
import { canPitch, pitchBooked, pitchChance } from '../../sim/clientService'
import { clientCarInfo, isDue, pickReturning, type Client } from '../../sim/clients'
import { formatTime, isClosed } from '../../sim/clock'
import { assignCredit } from '../../sim/credit'
import { generateCustomer, PLAYER_ID, type Customer } from '../../sim/customers'
import { CONVERSATION_PHASES, recordVisitors } from '../../sim/deal'
import { freeSpot } from '../../sim/driving'
import { formatMoney } from '../../sim/format'
import { carName } from '../../sim/interactables'
import { availableCars } from '../../sim/inventory'
import { DESK_PHONE_ID } from '../../sim/layout'
import { createRng, type Rng } from '../../sim/rng'
import { toTrader } from '../../sim/tradeIns'
import { rollUsedCar } from '../../sim/usedCars'
import {
  arrivalOpts,
  commit,
  dispatch,
  endDeal,
  notify,
  tallyMissed,
  tuning,
  withClientStats,
  type Kit,
} from '../core'
import { nextActionId, nextCustomerId, rng } from '../rng'
import type { GameState } from '../types'
import { amendLog } from './career'

type ClientKeys =
  | 'phoneClient'
  | 'setReceptionCalls'
  | 'setLoyaltyDiscount'
  | 'setReferralFee'
  | 'bookAppreciation'
  | 'devReturnClient'

/**
 * The client book: calls, appointments, perks and appreciation day. (The
 * book and today's visits and calls start with `dayOne`.)
 */
export function clientsSlice(k: Kit): Pick<GameState, ClientKeys> {
  const { get, set } = k
  return {
    phoneClient: (clientId) => {
      const s = get()
      const list = callList(s.clients, s.clock.day, notToCall(k))
      const entry = clientId ? list.find((x) => x.client.id === clientId) : list[0]
      if (!entry) {
        set({ menu: null })
        const named = clientId && s.clients.find((c) => c.id === clientId)
        notify(
          k,
          named ? `${named.name} isn't one to call right now.` : 'Nobody to call right now.',
        )
        return false
      }
      // Like turning to anything else: the conversation ends, a buyer in tow keeps following.
      endDeal(k, CONVERSATION_PHASES)
      set({ moveOrder: null, menu: null, inspectedId: null, stockOpen: false })
      dispatch(k, { type: 'request', id: nextActionId(), targetId: DESK_PHONE_ID, action: 'call' })
      set({ playerCall: entry.client.id })
      return true
    },
    setReferralFee: (fee) => {
      set({ clientPerks: { ...get().clientPerks, referralFee: fee } })
    },
    bookAppreciation: (day) => {
      const s = get()
      const today = s.clock.day
      const blocker = appreciationBlocker(
        { appreciation: s.appreciation, book: s.clients, cash: s.cash, today },
        day,
      )
      if (blocker) {
        notify(k, blocker)
        return false
      }
      const cost = appreciationCost(s.clients)
      const stats = s.dayStats.clients
      set({
        cash: s.cash - cost,
        appreciation: { day, month: monthIndex(day) },
        dayStats: withClientStats(s.dayStats, {
          ...stats,
          appreciation: stats.appreciation + cost,
        }),
      })
      amendLog(k)
      notify(
        k,
        `Client appreciation day booked for ${longDate(day)}, ${formatMoney(cost)}. Your clients are invited.`,
      )
      return true
    },
    setLoyaltyDiscount: (discount) => {
      set({ clientPerks: { ...get().clientPerks, loyaltyDiscount: discount } })
    },
    setReceptionCalls: (on) => {
      const perks = get().clientPerks
      if (perks.receptionCalls === on) return
      set({ clientPerks: { ...perks, receptionCalls: on }, ...(!on && { receptionCall: null }) })
    },
    devReturnClient: () => {
      const s = get()
      if (isClosed(s.clock)) return
      const onLot = new Set(s.customers.flatMap((c) => (c.clientId ? [c.clientId] : [])))
      const client = pickReturning(s.clients, onLot, createRng(Date.now()), s.clock.day)
      if (!client) return notify(k, 'Nobody in the client book to bring back.')
      const dev = createRng(Date.now())
      const [c] = assignCredit(
        [returningVisitor(k, client, s.customers, dev)],
        dev,
        tuning(k).creditMix,
      )
      set({ dayStats: tallyMissed(k, recordVisitors(s.dayStats, [c]), [c]) })
      commit(k, [...get().customers, c])
    },
  }
}

/** Clients from the book who are on the lot, being called, or were phoned today: not to call now. */
function notToCall(k: Kit): Set<string> {
  const s = k.get()
  const skip = new Set(s.callsTried)
  for (const c of s.customers) if (c.clientId) skip.add(c.clientId)
  if (s.receptionCall) skip.add(s.receptionCall.clientId)
  if (s.activeAction?.action === 'call' && s.playerCall) skip.add(s.playerCall)
  return skip
}

/**
 * A call to client `clientId` by `by` (the player or the receptionist, at
 * `skill`) has ended: how it went is rolled, the book takes it in, and the
 * day's tally counts it. The player hears every outcome; a receptionist's
 * call is only told when it books someone.
 */
export function endCall(k: Kit, clientId: string, by: string, skill: number): void {
  const s = k.get()
  const client = s.clients.find((c) => c.id === clientId)
  const kind = client && callKind(client, s.clock.day)
  if (!client || !kind) return
  const result = callOutcome(client, kind, skill, rng.client, { scale: tuning(k).clientReturn })
  const minute = result.outcome === 'booked' ? appointmentMinute(rng.client) : 0
  const stats = s.dayStats.clients
  k.set({
    clients: applyCall(s.clients, clientId, kind, result, s.clock.day, minute),
    callsTried: [...s.callsTried, clientId],
    dayStats: withClientStats(s.dayStats, {
      ...stats,
      calls: stats.calls + 1,
      booked: stats.booked + (result.outcome === 'booked' ? 1 : 0),
    }),
  })
  if (by === PLAYER_ID) return notify(k, callLine(client.name, kind, result, minute))
  if (result.outcome !== 'booked') return
  const who = s.roster.find((e) => e.id === by)?.name ?? 'Your receptionist'
  notify(k, `${who} booked ${client.name} for ${formatTime(minute)} tomorrow.`)
}

/**
 * Over `minutes` of the clock: a receptionist at the desk with nobody
 * waiting works the call list, one call at a time, slower the greener they
 * are. Anyone waiting comes first: they hang up and see to them.
 */
export function receptionCalls(k: Kit, minutes: number): void {
  const { get, set } = k
  const s = get()
  const e = s.roster.find((x) => x.role === 'receptionist' && x.status === 'atPost' && !x.fired)
  const free =
    e &&
    s.clientPerks.receptionCalls &&
    !isClosed(s.clock) &&
    !s.customers.some((c) => c.phase === 'waiting')
  if (!free) {
    if (s.receptionCall) set({ receptionCall: null })
    return
  }
  const call = s.receptionCall
  if (!call) {
    const next = callList(s.clients, s.clock.day, notToCall(k))[0]
    if (!next) return
    const left = CALL_MINUTES * receptionCallTime(e.skill)
    set({ receptionCall: { employeeId: e.id, clientId: next.client.id, kind: next.kind, left } })
    return
  }
  if (call.left > minutes) return set({ receptionCall: { ...call, left: call.left - minutes } })
  set({ receptionCall: null })
  endCall(k, call.clientId, e.id, callSkill(e.skill))
}

/**
 * Client `client` back on the lot, as they were last time, built on `rng`.
 * One due to trade up (or a `guest` on appreciation day due soon) is priced
 * at the loyalty discount and, while a space
 * in customer parking is free (`present` and the purchases' spaces are
 * taken), drives in with the car we sold them and brings it to trade. With
 * no space they come on foot, without it.
 */
function returningVisitor(
  k: Kit,
  client: Client,
  present: readonly Customer[],
  rng: Rng,
  guest = false,
): Customer {
  const s = k.get()
  const day = s.clock.day
  const tradeUp = guest ? nearlyDue(client, day) : isDue(client, day)
  const c = generateCustomer(nextCustomerId(), availableCars(s.inventory), rng, {
    ...arrivalOpts(k),
    client,
    tradeUp,
    guest,
    loyaltyCut: s.clientPerks.loyaltyDiscount,
  })
  const spot = freeSpot(
    present,
    s.purchases.map((p) => p.spot),
  )
  if (spot === null) return c
  const car = client.car
    ? { model: client.car.model, ...clientCarInfo(client.car, day) }
    : rollUsedCar(rng, day)
  const driven = { ...c, vehicle: { car, spot, parked: false } }
  if (!tradeUp || !client.car) return driven
  const level = tuning(k)
  return toTrader(driven, rng, day, { hope: level.tradeHope, noise: level.appraisalNoise })
}

/**
 * Clients due in by `minute` (on an appointment, to trade up or as guests
 * on appreciation day) and the friends clients sent turn up on the book's
 * own rng, before anyone else gets the parking. A guest is
 * `APPRECIATION_BOOST` happier for being asked.
 */
export function clientArrivals(k: Kit, minute: number, present: readonly Customer[]): Customer[] {
  const s = k.get()
  if (isClosed(s.clock)) return []
  const { due, rest } = takeDueClients(s.clientVisits, minute)
  if (due.length === 0) return []
  k.set({ clientVisits: rest })
  const out: Customer[] = []
  let book = s.clients
  for (const v of due) {
    const client = book.find((c) => c.id === v.clientId)
    if (!client) continue
    if (v.reason === 'friend') {
      out.push(friendOf(k, client))
      continue
    }
    if (present.some((c) => c.clientId === client.id)) continue
    const guest = v.reason === 'appreciation'
    out.push(returningVisitor(k, client, [...present, ...out], rng.client, guest))
    if (guest) book = welcomeGuest(book, client.id)
  }
  if (book !== s.clients) k.set({ clients: book })
  return out
}

/** A friend `referrer` sent in: a stranger, ready to buy, who says who sent them. */
function friendOf(k: Kit, referrer: Client): Customer {
  return generateCustomer(nextCustomerId(), availableCars(k.get().inventory), rng.client, {
    ...arrivalOpts(k),
    source: 'referral',
    referredBy: referrer.id,
  })
}

/**
 * The player pitches a trade-up to service client `id`, a client from the
 * book due soon, once a visit. Taken (`pitchChance`), they're booked to come
 * back tomorrow, ready to trade in the car we're servicing.
 */
export function pitch(k: Kit, id: string): void {
  const s = k.get()
  const c = s.customers.find((x) => x.id === id)
  const client = c?.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined
  if (!c?.service?.pitch) return
  commit(
    k,
    s.customers.map((x) => (x === c ? { ...x, service: { ...c.service!, pitch: false } } : x)),
  )
  const car = carName(c.service.car.model)
  if (!client || !canPitch(client, s.clock.day) || rng.client.next() >= pitchChance(client)) {
    return notify(k, `${c.name}: "I'm happy with my ${car} for now, thanks."`)
  }
  const minute = appointmentMinute(rng.client)
  const stats = k.get().dayStats.clients
  k.set({
    clients: pitchBooked(k.get().clients, client.id, s.clock.day, minute),
    dayStats: withClientStats(k.get().dayStats, { ...stats, booked: stats.booked + 1 }),
  })
  notify(
    k,
    `${c.name} will come back tomorrow at ${formatTime(minute)} to look at trading in their ${car}.`,
  )
}
