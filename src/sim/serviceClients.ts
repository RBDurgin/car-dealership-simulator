import { ARCHETYPES, type Archetype } from './archetypes'
import { generateCustomer, type Customer } from './customers'
import { SERVICE_SPOTS, type CarModel } from './layout'
import type { Rng } from './rng'
import { quote, RATE_LEVELS, type JobKind, type Quote, type RateLevel } from './service'
import { rollUsedCar, type UsedInfo } from './usedCars'

/**
 * Service clients (Phase 15c): people who drive their own car in for a job.
 * They park in a service space, check in at the garage's counter (with the
 * player or the service advisor), and either wait in the garage's chairs or
 * drop the car off and come back for it. They pay when they collect it.
 *
 *   arriving ─parked─► waiting ─greet─► talking ─offer─► considering ─booked─► servicing
 *                         ▲                                  │                    │
 *                         └────────────cancel────────────────┤               collect
 *                                                       respond(walk)             ▼
 *                                                            ▼             leaving(serviced)
 *                                                    leaving(declined)
 *
 * A drop-off walks off to the sidewalk and `wentAway` removes them; the store
 * keeps them until the time they were promised, and they walk back in. A job
 * that doesn't hold brings them back later in the day (`comebackClient`) for
 * a free redo.
 */

/** What a service client came for, and how it's going. */
export interface ServiceVisit {
  kind: JobKind
  /** Their own car. */
  car: UsedInfo & { model: CarModel }
  /** Index into `SERVICE_SPOTS`: theirs from drop-off until they drive off. */
  spot: number
  /** In its space with the driver out. False while it's still driving in. */
  parked: boolean
  /** What the job costs them, at the shop rate when they drove in. */
  quote: Quote
  /** Their job, once they've taken the quote. */
  jobId: string | null
  /** When they were told it would be ready, once they've taken the quote. */
  promisedMinute: number | null
  /** Too long to wait for: they leave the car and come back for it. */
  dropOff: boolean
  /** A drop-off back to collect their car. */
  returned: boolean
  /** Back because the last job didn't hold: the redo is free. */
  comeback: boolean
}

/** What a client drove in for, in a sentence: "for an oil change". */
export const JOB_WANTS: Record<JobKind, string> = {
  oil: 'an oil change',
  tires: 'new tires',
  brakes: 'a brake job',
  repair: 'a repair',
  recall: 'recall work',
  recon: 'reconditioning',
}

/** A client told the car will be ready within this many game minutes waits for it. */
export const WAIT_LIMIT = 60

/** The odds a client takes a quote at the standard rate, before their archetype. */
export const QUOTE_ACCEPT = 0.85
const ACCEPT_RANGE = { min: 0.3, max: 0.97 }

/** The odds a client of `archetype` takes a quote at the shop `rate`. */
export function quoteAcceptChance(rate: RateLevel, archetype: Archetype): number {
  const chance = QUOTE_ACCEPT * RATE_LEVELS[rate].accept + ARCHETYPES[archetype].accept
  return Math.max(ACCEPT_RANGE.min, Math.min(ACCEPT_RANGE.max, chance))
}

/**
 * A service client driving in on `day` for a `kind` job, into service space
 * `spot`, quoted at the shop `rate`. They come alone (no couples) and don't shop.
 */
export function serviceClient(
  id: string,
  kind: JobKind,
  spot: number,
  rng: Rng,
  day: number,
  rate: RateLevel,
  patienceFactor = 1,
): Customer {
  const c = generateCustomer(id, [], rng, { patienceFactor })
  const archetype = c.archetype === 'couple' ? 'regular' : c.archetype
  return {
    ...c,
    archetype,
    companion: null,
    service: {
      kind,
      car: rollUsedCar(rng, day),
      spot,
      parked: false,
      quote: quote(kind, rate, rng),
      jobId: null,
      promisedMinute: null,
      dropOff: false,
      returned: false,
      comeback: false,
    },
  }
}

/** Nothing to pay: a redo of a job that didn't hold. */
export const FREE_QUOTE: Quote = { labor: 0, parts: 0, partsCost: 0 }

/**
 * Client `c`, who collected their car and drove off, driving back in as `id`
 * into service space `spot` because the job didn't hold: the same person and
 * car, patient again, for a free redo.
 */
export function comebackClient(c: Customer, id: string, spot: number): Customer {
  return {
    ...c,
    id,
    phase: 'arriving',
    leaveReason: null,
    handlerId: null,
    chairId: null,
    offer: null,
    haggle: null,
    patienceLeft: c.patience,
    service: {
      ...c.service!,
      spot,
      parked: false,
      quote: FREE_QUOTE,
      jobId: null,
      promisedMinute: null,
      dropOff: false,
      returned: false,
      comeback: true,
    },
  }
}

/** Service spaces held by a client's car: those on the lot and those `away` until later. */
export function serviceSpotsInUse(
  customers: readonly Customer[],
  away: readonly Customer[] = [],
): Set<number> {
  return new Set([...customers, ...away].flatMap((c) => (c.service ? [c.service.spot] : [])))
}

/** The first free service space, or null when they're all taken. */
export function freeServiceSpot(
  customers: readonly Customer[],
  away: readonly Customer[] = [],
): number | null {
  const used = serviceSpotsInUse(customers, away)
  const i = SERVICE_SPOTS.findIndex((_, n) => !used.has(n))
  return i < 0 ? null : i
}

/** How many service spaces are free. */
export function freeServiceSpots(
  customers: readonly Customer[],
  away: readonly Customer[] = [],
): number {
  return SERVICE_SPOTS.length - serviceSpotsInUse(customers, away).size
}

/** Whether `c` came in for service rather than to shop or sell. */
export function isServiceClient(c: Pick<Customer, 'service'>): boolean {
  return c.service !== null
}
