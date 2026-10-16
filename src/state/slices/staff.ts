import { washCar } from '../../sim/cleanliness'
import { isClosed } from '../../sim/clock'
import { chooseTarget, PLAYER_ID, reduceCustomers, type CustomerPhase } from '../../sim/customers'
import { dealCustomer, hasBuyersInHand } from '../../sim/deal'
import { expansionsUp } from '../../sim/expansions'
import { formatMoney } from '../../sim/format'
import { carName } from '../../sim/interactables'
import { availableCars } from '../../sim/inventory'
import {
  quoteFor,
  roundOf,
  staffAllowance,
  staffAsk,
  staffBuyOffer,
  stickerOf,
} from '../../sim/negotiation'
import { buyBlocker, staffAppraisal, vehicleTargetId } from '../../sim/sellers'
import {
  canHire,
  departingOnFire,
  financeOnDuty,
  reduceStaff,
  retentionRaise,
  ROLE_LABELS,
} from '../../sim/staff'
import { grow, levelUpNotice, withLevelUp, xpToLevel } from '../../sim/growth'
import { freeSalesperson, leadChoice } from '../../sim/staffAi'
import { carsHeld, driveMinutes, staffDriveCar } from '../../sim/testDrive'
import { commit, lostCoworkers, notify, setRoster, tallyWork, type Kit } from '../core'
import { rng } from '../rng'
import type { GameState } from '../types'
import { declineBuyer, sign, staffDeal, tradeAllowance, tradeLine } from './customers'
import { tallyNazma } from './world'

type StaffKeys =
  | 'roster'
  | 'hire'
  | 'fire'
  | 'keepEmployee'
  | 'dispatchStaff'
  | 'answerRaise'
  | 'devGrowStaff'
  | 'staffClaim'
  | 'staffGreet'
  | 'staffOffer'
  | 'staffTestDrive'
  | 'staffBoard'
  | 'sendWith'
  | 'staffLead'
  | 'staffSign'
  | 'staffWash'

/** The payroll and what the sales staff and porters do. (Today's applicants come with `dayOne`.) */
export function staffSlice(k: Kit): Pick<GameState, StaffKeys> {
  const { get, set } = k
  return {
    roster: [],
    hire: (id) => {
      const s = get()
      const c = s.candidates.find((x) => x.id === id)
      if (!c) return
      const blocker = canHire(s.roster, c.role, expansionsUp(s))
      if (blocker) return notify(k, blocker)
      set({ candidates: s.candidates.filter((x) => x !== c) })
      setRoster(k, reduceStaff(s.roster, { type: 'hire', employee: c, open: !isClosed(s.clock) }))
      notify(k, `${c.name} joins as ${ROLE_LABELS[c.role].toLowerCase()}.`)
    },
    fire: (id) => {
      const e = get().roster.find((x) => x.id === id)
      if (!e || e.fired) return
      setRoster(k, reduceStaff(get().roster, { type: 'fire', id }))
      lostCoworkers(k, 1)
      // A salesperson still talking someone round lets them go back to waiting.
      commit(k, departingOnFire(get().customers, id))
      if (hasBuyersInHand(get().customers, id)) {
        notify(k, `You let ${e.name} go. They'll finish their paperwork first.`)
      } else notify(k, `You let ${e.name} go.`)
    },
    keepEmployee: (id) => {
      const e = get().roster.find((x) => x.id === id)
      if (!e?.quitting || e.fired) return
      const raise = retentionRaise(e.wage)
      setRoster(k, reduceStaff(get().roster, { type: 'keep', id, wage: e.wage + raise }))
      // Nazma's summary line lists those he poached and were kept.
      if (!get().dayStats.resigned.includes(id)) {
        tallyNazma(k, { kept: [...get().dayStats.nazma.kept, { name: e.name, raise }] })
      }
      notify(k, `${e.name} is staying, for ${formatMoney(raise)} a day more.`)
    },
    dispatchStaff: (ev) => {
      const before = get().roster
      setRoster(k, reduceStaff(before, ev))
      if (ev.type === 'atPost' && get().roster !== before) tallyWork(k, ev.id, 'came')
    },
    answerRaise: (id, grant) => {
      const e = get().roster.find((x) => x.id === id)
      if (!e?.raiseAsk || e.fired) return
      const wage = e.raiseAsk.wage
      setRoster(k, reduceStaff(get().roster, { type: 'raise', id, grant }))
      // Turned down, it costs them some morale at closing.
      if (!grant) {
        const stats = get().dayStats
        set({ dayStats: { ...stats, raisesDeclined: [...stats.raisesDeclined, id] } })
      }
      notify(
        k,
        grant
          ? `${e.name} is on ${formatMoney(wage)} a day now.`
          : `${e.name} stays on ${formatMoney(e.wage)} a day.`,
      )
    },
    devGrowStaff: () => {
      const s = get()
      const levelUps = [...s.dayStats.levelUps]
      const roster = s.roster.map((e) =>
        e.fired || e.status === 'off'
          ? e
          : withLevelUp(grow(e, xpToLevel(e.skill) - e.xp), e.skill, s.clock.day, levelUps),
      )
      const grown = levelUps.slice(s.dayStats.levelUps.length)
      if (grown.length === 0) return notify(k, 'Nobody on the lot can grow any further.')
      setRoster(k, roster)
      set({ dayStats: { ...get().dayStats, levelUps } })
      notify(k, levelUpNotice(grown)!)
    },
    staffClaim: (employeeId, customerId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      if (!e || e.role !== 'sales' || e.fired || e.status !== 'atPost') return false
      // One customer at a time, and never the one the player is heading to.
      if (s.customers.some((c) => c.handlerId === employeeId && c.phase !== 'leaving')) return false
      if (s.activeAction?.targetId === customerId) return false
      const c = s.customers.find((x) => x.id === customerId)
      // Service clients are for the garage's counter.
      if (c?.service) return false
      // A seller's car needs a lot space and some cash.
      if (c?.selling && buyBlocker(s)) return false
      commit(k, reduceCustomers(s.customers, { type: 'claim', id: customerId, by: employeeId }))
      return get().customers.find((c) => c.id === customerId)?.handlerId === employeeId
    },
    staffGreet: (employeeId) => {
      const c = staffCustomer(k, employeeId, ['browsing', 'waiting'])
      if (!c) return
      const carId = c.selling ? null : chooseTarget(c, availableCars(get().inventory))
      commit(
        k,
        reduceCustomers(get().customers, { type: 'greet', id: c.id, carId, by: employeeId }),
      )
    },
    staffOffer: (employeeId) => {
      const s = get()
      const c = staffCustomer(k, employeeId, ['talking'])
      const e = s.roster.find((x) => x.id === employeeId)
      if (!c || !e) return
      // What they make of the customer's car, if they're selling it or trading it in.
      const appraisal = staffAppraisal(c, e.id, s.clock.day, e.skill)?.estimate ?? 0
      if (c.selling) {
        const price = staffBuyOffer(e.skill, appraisal, c.haggle)
        // No room or cash for it any more: they give up on this one.
        if (buyBlocker(s, price)) {
          commit(k, reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
          return
        }
        const ev = { type: 'offer', id: c.id, carId: vehicleTargetId(c.id), price } as const
        commit(k, reduceCustomers(s.customers, ev))
        return
      }
      const car = s.inventory.find((x) => x.id === c.targetCarId)
      // Sold to someone else while they talked: nothing left to offer.
      if (!car || car.status !== 'available') {
        commit(k, reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
        return
      }
      const allow = c.trade
        ? tradeAllowance(k, c, staffAllowance(e.skill, appraisal, c.trade.hope, roundOf(c)))
        : undefined
      const ask = staffAsk(e.skill, car, c.haggle, allow, quoteFor(c, car), stickerOf(c, car))
      const price = Math.max(allow ?? 0, ask)
      const ev = { type: 'offer', id: c.id, carId: car.id, price, allowance: allow } as const
      commit(k, reduceCustomers(s.customers, ev))
    },
    staffTestDrive: (employeeId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const c = staffCustomer(k, employeeId, ['talking'])
      if (!e || e.fired || !c) return
      const car = staffDriveCar(c, s.inventory, carsHeld(s.customers))
      if (!car) return
      const minutes = driveMinutes(rng.testDrive)
      const ev = { type: 'testDrive', id: c.id, carId: car.id, by: e.id, minutes } as const
      commit(k, reduceCustomers(s.customers, ev))
      tallyWork(k, e.id, 'drives')
    },
    staffBoard: (employeeId) => {
      const c = staffCustomer(k, employeeId, ['talking'])
      if (!c?.drive || c.drive.back) return
      commit(k, reduceCustomers(get().customers, { type: 'boarded', id: c.id }))
    },
    sendWith: (customerId, employeeId) => {
      const s = get()
      const c = dealCustomer(s.customers, PLAYER_ID)
      const e = freeSalesperson(s.roster, s.customers, expansionsUp(s))
      if (c?.id !== customerId || c.phase !== 'talking') return
      if (e?.id !== employeeId) return notify(k, 'That salesperson is busy.')
      const car = staffDriveCar(c, s.inventory, carsHeld(s.customers))
      if (!car) return notify(k, `There's nothing for ${c.name} to drive.`)
      commit(k, reduceCustomers(s.customers, { type: 'sendWith', id: c.id, to: e.id }))
      set({ menu: null, inspectedId: null })
      notify(k, `${e.name} will take ${c.name} out in the ${carName(car.model)}.`)
    },
    staffLead: (employeeId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const c = staffCustomer(k, employeeId, ['following'])
      if (!e || !c || c.chairId !== null) return
      const choice = leadChoice(e, s.customers, s.roster, expansionsUp(s))
      if (!choice) {
        commit(k, reduceCustomers(s.customers, { type: 'cancel', id: c.id }))
        return
      }
      if (choice.kind === 'desk') {
        commit(k, reduceCustomers(s.customers, { type: 'lead', id: c.id, chairId: choice.chairId }))
        return
      }
      const fm = financeOnDuty(s.roster)!
      commit(k, reduceCustomers(s.customers, { type: 'handOff', id: c.id, to: fm.id }))
    },
    staffSign: (employeeId, customerId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const c = s.customers.find((x) => x.id === customerId)
      if (!e || c?.phase !== 'signing' || c.handlerId !== employeeId) return
      const deal = c.offer ? staffDeal(k, c, e) : null
      if (c.offer && !deal) {
        // No lender at the buy rate: the finance manager may get them one with more down.
        const fm = e.role === 'finance' ? null : financeOnDuty(s.roster)
        if (!fm) {
          const line = `No bank will take ${c.name} at the buy rate, and there's no finance manager to try more down. They went home.`
          return declineBuyer(k, c, e.role === 'finance' ? undefined : line)
        }
        commit(k, reduceCustomers(s.customers, { type: 'handOff', id: c.id, to: fm.id }))
        return notify(
          k,
          `${e.name}: "No bank will take ${c.name} at the buy rate. Over to finance."`,
        )
      }
      const sale = sign(k, c, e, deal)
      if (!sale) {
        commit(k, reduceCustomers(get().customers, { type: 'cancel', id: c.id }))
        return notify(k, `${e.name}: "The ${c.name} deal fell through."`)
      }
      notify(
        k,
        `${sale.soldBy ?? e.name} sold the ${carName(sale.model)} to ${c.name} for ${formatMoney(sale.price)}!${tradeLine(sale)}`,
      )
    },
    staffWash: (employeeId, carId) => {
      const e = get().roster.find((x) => x.id === employeeId)
      if (e?.role !== 'porter' || e.status !== 'atPost') return
      const inventory = washCar(get().inventory, carId)
      if (inventory === get().inventory) return
      set({ inventory })
      tallyWork(k, e.id, 'washes')
    },
  }
}

/** The customer salesperson `employeeId` is dealing with in `phases`, if any. */
function staffCustomer(k: Kit, employeeId: string, phases: readonly CustomerPhase[]) {
  return k.get().customers.find((c) => c.handlerId === employeeId && phases.includes(c.phase))
}
