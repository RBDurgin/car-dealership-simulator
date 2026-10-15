import { calendarOf, DAYS_PER_MONTH } from './calendar'
import { clientCarInfo, type Client, type ClientCar } from './clients'
import { OPEN_MINUTE } from './clock'
import { WARRANTY_MONTHS } from './fi'
import type { Rng } from './rng'
import { LAST_SERVICE_MINUTE, quote, SERVICE_WEEKDAY, type ClaimVisit, type Quote } from './service'
import type { UsedInfo } from './usedCars'

/**
 * Extended warranty contracts (19d): each warranty sold at the F&I menu is a
 * contract that runs `WARRANTY_DAYS`. While it runs, the car comes back to the
 * garage for a repair now and then (`contractVisits`), which the warranty
 * company pays for like a recall: book time at `WARRANTY_HOURLY` and the parts
 * at cost (`warrantyPay`). The client pays nothing, and takes the extra work
 * a mechanic finds more often (`CONTRACT_UPSELL`). Saved with the game.
 */
export interface Contract {
  /** "contract-<day>-<n>". */
  id: string
  /** Who bought it, to know them when they come in. */
  customerName: string
  /** The car it covers, as sold. */
  car: ClientCar
  soldDay: number
  /** The last day it covers. */
  endDay: number
  /** What the buyer paid for it. */
  price: number
}

/** How long a warranty runs, in game days. */
export const WARRANTY_DAYS = WARRANTY_MONTHS * DAYS_PER_MONTH
/** The book keeps at most this many, newest first: the oldest lapse early. */
export const MAX_CONTRACTS = 200
/** A covered car comes in for a claim about once in this many days. */
export const CLAIM_EVERY = 60
/** Added to the odds a contract holder takes extra work a mechanic found. */
export const CONTRACT_UPSELL = 0.15

/** The share of a week's days the shop is open, weighted: a claim day's odds are shared out by weekday. */
const WEEK_WEIGHT = SERVICE_WEEKDAY.reduce((a, b) => a + b, 0) / SERVICE_WEEKDAY.length

/** The warranty on `car`, sold on `day` for `price`. */
export function newContract(
  id: string,
  customerName: string,
  car: ClientCar,
  day: number,
  price: number,
): Contract {
  return { id, customerName, car, soldDay: day, endDay: day + WARRANTY_DAYS, price }
}

/** Whether `c` covers its car on `day`: from the day after it's sold to its last day. */
export function inForce(c: Contract, day: number): boolean {
  return day > c.soldDay && day <= c.endDay
}

/**
 * The contracts still in force on `day`, at most `MAX_CONTRACTS` (the newest).
 * The same array when none has run out.
 */
export function liveContracts(contracts: Contract[], day: number): Contract[] {
  const live = contracts.filter((c) => day <= c.endDay)
  if (live.length <= MAX_CONTRACTS) return live.length === contracts.length ? contracts : live
  return live.slice(live.length - MAX_CONTRACTS)
}

/** `contracts` with `added` on the end, kept to `MAX_CONTRACTS`. */
export function addContracts(contracts: Contract[], added: readonly Contract[]): Contract[] {
  if (added.length === 0) return contracts
  const all = [...contracts, ...added]
  return all.length <= MAX_CONTRACTS ? all : all.slice(all.length - MAX_CONTRACTS)
}

/** A covered car's chance of coming in for a claim on `day`: none on Sundays, when the shop is shut. */
export function claimChance(day: number): number {
  return SERVICE_WEEKDAY[calendarOf(day).weekday] / WEEK_WEIGHT / CLAIM_EVERY
}

/**
 * The claims on `day`: each contract in force rolls `claimChance` on `rng`,
 * at a minute bunched toward the morning like other service visits, at most
 * `max` of them. Nothing on a day the bays can take no more.
 */
export function contractVisits(
  contracts: readonly Contract[],
  day: number,
  rng: Rng,
  max = Infinity,
): ClaimVisit[] {
  const chance = claimChance(day)
  if (chance <= 0 || max < 1) return []
  const span = LAST_SERVICE_MINUTE - OPEN_MINUTE
  const out: ClaimVisit[] = []
  for (const c of contracts) {
    if (out.length >= Math.floor(max)) break
    if (!inForce(c, day) || rng.next() >= chance) continue
    const minute = Math.round(OPEN_MINUTE + Math.min(rng.next(), rng.next()) * span)
    out.push({ contractId: c.id, minute })
  }
  return out.sort((a, b) => a.minute - b.minute)
}

/** A claim's quote: the client pays nothing, and the parts' cost is rolled like a repair's. */
export function claimQuote(rng: Rng): Quote {
  return { labor: 0, parts: 0, partsCost: quote('repair', 'standard', rng).partsCost }
}

/** The client in the book `c` was sold to, if they're still in it with that car. */
export function holderOf(book: readonly Client[], c: Contract): Client | null {
  return (
    book.find(
      (x) =>
        x.name === c.customerName &&
        x.car?.model === c.car.model &&
        x.car.boughtDay === c.car.boughtDay,
    ) ?? null
  )
}

/** The covered car on `day`, aged since it was sold. */
export function contractCar(c: Contract, day: number): UsedInfo & { model: ClientCar['model'] } {
  return { model: c.car.model, ...clientCarInfo(c.car, day) }
}

/** Contracts in force on `day`, and those due to run out within `soon` days. */
export function contractSummary(
  contracts: readonly Contract[],
  day: number,
  soon = DAYS_PER_MONTH,
): { live: number; ending: number } {
  let live = 0
  let ending = 0
  for (const c of contracts) {
    if (day > c.endDay) continue
    live++
    if (c.endDay - day < soon) ending++
  }
  return { live, ending }
}
