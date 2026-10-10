import { calendarOf } from './calendar'
import { washCar } from './cleanliness'
import type { Customer } from './customers'
import type { InventoryCar } from './inventory'
import { CLOSE_MINUTE, OPEN_MINUTE } from './clock'
import { SERVICE_BAYS, serviceBays, type CarModel, type ExpansionId } from './layout'
import type { Career } from './progression'
import type { Rng } from './rng'
import { MAX_SKILL, MIN_SKILL, skillSeconds } from './staff'
import { marketValue, usedListPrice } from './usedCars'

/**
 * The service department (Phase 15): the garage's jobs, what they cost and
 * take, and how many clients drive in for one. Service brings in money apart
 * from car sales; the more cars the dealership has sold, the busier it is.
 */

export type JobKind = 'oil' | 'tires' | 'brakes' | 'repair' | 'recall' | 'recon'

export const JOB_KINDS: readonly JobKind[] = ['oil', 'tires', 'brakes', 'repair', 'recall', 'recon']

export interface JobSpec {
  label: string
  /** Book time in game minutes, for a mechanic of middling skill. */
  minutes: number
  /** What the parts cost the dealership, in dollars. */
  parts: { min: number; max: number }
}

export const JOBS: Record<JobKind, JobSpec> = {
  oil: { label: 'Oil change', minutes: 30, parts: { min: 30, max: 60 } },
  tires: { label: 'New tires', minutes: 60, parts: { min: 300, max: 600 } },
  brakes: { label: 'Brake job', minutes: 90, parts: { min: 150, max: 300 } },
  repair: { label: 'Repair', minutes: 150, parts: { min: 200, max: 500 } },
  recall: { label: 'Recall work', minutes: 60, parts: { min: 50, max: 150 } },
  recon: { label: 'Reconditioning', minutes: 120, parts: { min: 300, max: 800 } },
}

/** How often a client who drives in wants each kind of job. */
const CLIENT_KINDS: readonly { kind: JobKind; weight: number }[] = [
  { kind: 'oil', weight: 0.4 },
  { kind: 'brakes', weight: 0.25 },
  { kind: 'tires', weight: 0.2 },
  { kind: 'repair', weight: 0.15 },
]

export type JobStatus = 'waiting' | 'inBay' | 'ready' | 'done'

export interface ServiceJob {
  id: string
  kind: JobKind
  /** The client whose car it is, or null for reconditioning stock. */
  customerId: string | null
  /** The stock car being reconditioned, or null for a client's car. */
  carId: string | null
  /** The bay it's in, or null while it waits for one. */
  bay: number | null
  /** The mechanic who last worked on it, or null before anyone has. */
  mechanicId: string | null
  status: JobStatus
  /** Game minutes worked so far, and needed. */
  worked: number
  minutes: number
  /** What the client pays for labor and parts, and what the parts cost us. */
  labor: number
  parts: number
  partsCost: number
  /** Extra work the mechanic found (15d), or null. */
  finding: Finding | null
  /** A client's name and car, for the Service tab and the lift; null for our own. */
  client: { name: string; model: CarModel; condition: number } | null
  /** The game minute a client's car was ready, or null until it is. */
  readyMinute: number | null
}

export interface Finding {
  label: string
  labor: number
  parts: number
  partsCost: number
}

/** The shop rate: what labor costs the client, and what that does to business. */
export type RateLevel = 'budget' | 'standard' | 'premium'

export const RATE_IDS: readonly RateLevel[] = ['budget', 'standard', 'premium']

export interface RateSpec {
  label: string
  /** Labor, $ per hour. */
  hourly: number
  /** × the day's expected service visits. */
  demand: number
  /** × the odds a client takes a quote or a finding. */
  accept: number
}

export const RATE_LEVELS: Record<RateLevel, RateSpec> = {
  budget: { label: 'Budget', hourly: 90, demand: 1.25, accept: 1.2 },
  standard: { label: 'Standard', hourly: 120, demand: 1, accept: 1 },
  premium: { label: 'Premium', hourly: 160, demand: 0.75, accept: 0.8 },
}

export function isRateLevel(v: unknown): v is RateLevel {
  return (RATE_IDS as readonly unknown[]).includes(v)
}

/** The service department's settings, saved with the game. */
export interface ServiceSettings {
  rate: RateLevel
  /** Trade-ins go to the shop for reconditioning on their own. */
  autoRecon: boolean
}

export function defaultService(): ServiceSettings {
  return { rate: 'standard', autoRecon: false }
}

/** Parts are sold on at this much over cost. */
export const PARTS_MARKUP = 0.4

/** Game minutes a mechanic of `skill` takes over a `kind` job: better ones are faster. */
export function jobMinutes(kind: JobKind, skill: number): number {
  return Math.round(skillSeconds(JOBS[kind].minutes, skill))
}

export interface Quote {
  labor: number
  parts: number
  partsCost: number
}

/**
 * What a `kind` job costs the client at the shop `rate`: the book time's labor
 * (whoever does it, as shops charge) and the parts, marked up from a rolled cost.
 */
export function quote(kind: JobKind, rate: RateLevel, rng: Rng): Quote {
  const spec = JOBS[kind]
  const partsCost = Math.round(rng.int(spec.parts.min, spec.parts.max) / 5) * 5
  return {
    labor: Math.round((spec.minutes / 60) * RATE_LEVELS[rate].hourly),
    parts: Math.round(partsCost * (1 + PARTS_MARKUP)),
    partsCost,
  }
}

/** Service visits a day from town, whoever sold them their car. */
export const TOWN_SERVICE = 2
/** Service visits a day for each car the dealership has ever sold. */
export const SERVICE_PER_CAR = 0.025
/** × the day's visits by weekday, Monday first. The shop is shut on Sundays. */
export const SERVICE_WEEKDAY = [1.3, 1.1, 1.0, 1.0, 0.9, 0.7, 0]
/** Jobs one bay can take in a day. */
export const JOBS_PER_BAY = 6
/** Bays in the garage. */
export const GARAGE_BAYS = SERVICE_BAYS.length
/** The expansion that builds the garage. */
export const GARAGE_EXPANSION: ExpansionId = 'service-bay'

/** Bays standing with the `expansions` up: none until the garage is built. */
export function bayCount(expansions: readonly ExpansionId[]): number {
  return serviceBays(expansions).length
}

export interface DemandOpts {
  /** Bays up today; none and nobody comes. */
  bays: number
  rate: RateLevel
  /** The level's `Tuning.serviceDemand`. */
  factor?: number
}

/**
 * The service visits expected on `day`: a base from town plus a share of every
 * car sold, by the weekday, the shop rate and the level, and no more than the
 * bays can take.
 */
export function serviceDemand(
  day: number,
  career: Pick<Career, 'sales'>,
  opts: DemandOpts,
): number {
  const base = TOWN_SERVICE + career.sales * SERVICE_PER_CAR
  const expected =
    base *
    SERVICE_WEEKDAY[calendarOf(day).weekday] *
    RATE_LEVELS[opts.rate].demand *
    (opts.factor ?? 1)
  return Math.min(expected, opts.bays * JOBS_PER_BAY)
}

/** No new service client drives in after this, so the job can be done by closing. */
export const LAST_SERVICE_MINUTE = 15 * 60

/** A day's service visits, released like arrivals (see `takeDue`). */
export interface ServiceSchedule {
  /** Game minutes, ascending. */
  minutes: number[]
  /** The job each visit wants, by index into `minutes`. */
  kinds: JobKind[]
  spawned: number
}

export function emptySchedule(): ServiceSchedule {
  return { minutes: [], kinds: [], spawned: 0 }
}

/**
 * Plans `expected` visits (the fraction rolled) between opening and
 * `LAST_SERVICE_MINUTE`, drop-offs bunched toward the morning.
 */
export function planServiceVisits(rng: Rng, expected: number): ServiceSchedule {
  if (expected <= 0) return emptySchedule()
  const count = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0)
  const span = LAST_SERVICE_MINUTE - OPEN_MINUTE
  const visits = Array.from({ length: count }, () => ({
    minute: Math.round(OPEN_MINUTE + Math.min(rng.next(), rng.next()) * span),
    kind: pickKind(rng),
  }))
  visits.sort((a, b) => a.minute - b.minute)
  return { minutes: visits.map((v) => v.minute), kinds: visits.map((v) => v.kind), spawned: 0 }
}

function pickKind(rng: Rng): JobKind {
  let roll = rng.next()
  for (const { kind, weight } of CLIENT_KINDS) {
    roll -= weight
    if (roll < 0) return kind
  }
  return CLIENT_KINDS[CLIENT_KINDS.length - 1].kind
}

/**
 * The jobs of the visits due by `minute` that haven't spawned yet, at most
 * `max` of them (the rest wait for a free service space). Returns the same
 * schedule when none are due.
 */
export function takeDueVisits(
  schedule: ServiceSchedule,
  minute: number,
  max = Infinity,
): { schedule: ServiceSchedule; due: JobKind[] } {
  let spawned = schedule.spawned
  while (
    spawned < schedule.minutes.length &&
    schedule.minutes[spawned] <= minute &&
    spawned - schedule.spawned < max
  ) {
    spawned++
  }
  const due = schedule.kinds.slice(schedule.spawned, spawned)
  return { schedule: due.length > 0 ? { ...schedule, spawned } : schedule, due }
}

/** Comeback odds at the lowest and highest skill. */
const COMEBACK = { worst: 0.15, best: 0.02 }

/** The odds a job done by a mechanic of `skill` brings the car back for a redo. */
export function comebackChance(skill: number): number {
  const s = Math.max(MIN_SKILL, Math.min(MAX_SKILL, skill))
  const t = (s - MIN_SKILL) / (MAX_SKILL - MIN_SKILL)
  return COMEBACK.worst + (COMEBACK.best - COMEBACK.worst) * t
}

/** The day's service department, for the summary. */
export interface ServiceStats {
  /** Clients' jobs finished. */
  jobs: number
  /** Our own used cars reconditioned. */
  recon: number
  /** Customer-pay labor and parts billed, and what those parts cost. */
  labor: number
  parts: number
  partsCost: number
  /** What the manufacturer paid for recall work. */
  warranty: number
  /** Paid to mechanics for work finished after closing. */
  overtime: number
  /** Clients sent away for lack of time, who declined the quote, collected late, or came back. */
  turnedAway: number
  declined: number
  late: number
  comebacks: number
}

export function emptyServiceStats(): ServiceStats {
  return {
    jobs: 0,
    recon: 0,
    labor: 0,
    parts: 0,
    partsCost: 0,
    warranty: 0,
    overtime: 0,
    turnedAway: 0,
    declined: 0,
    late: 0,
    comebacks: 0,
  }
}

/** Reconditioning adds this much to a used car's condition… */
export const RECON_STEP = 0.3
/** …up to this. A car this good or better isn't worth the work. */
export const RECON_MAX = 0.9

/** The condition a used car comes out of the shop at. */
export function reconCondition(condition: number): number {
  return Math.min(RECON_MAX, Math.round((condition + RECON_STEP) * 100) / 100)
}

/**
 * What reconditioning a used `car` adds to its market value on `day` (0 for a
 * new car or one already at `RECON_MAX`).
 */
export function reconGain(car: InventoryCar, day: number): number {
  if (!car.used || car.used.condition >= RECON_MAX) return 0
  const after = { ...car.used, condition: reconCondition(car.used.condition) }
  return marketValue(car.model, after, day) - marketValue(car.model, car.used, day)
}

/**
 * Car `id` back from the shop on `day`: its condition up by `RECON_STEP`,
 * detailed (washed), re-listed at the price its new worth calls for (never
 * lower than it was) and for sale again. The `partsCost` goes on its cost, so
 * its gross when sold is honest. Returns the same array if it isn't in the shop.
 */
export function finishRecon(
  inventory: InventoryCar[],
  id: string,
  partsCost: number,
  day: number,
): InventoryCar[] {
  const car = inventory.find((c) => c.id === id)
  if (!car?.used || car.status !== 'recon') return inventory
  const used = { ...car.used, condition: reconCondition(car.used.condition) }
  const done: InventoryCar = {
    ...car,
    used,
    status: 'available',
    msrp: Math.max(car.msrp, usedListPrice(marketValue(car.model, used, day))),
    cost: car.cost + partsCost,
  }
  return washCar(
    inventory.map((c) => (c === car ? done : c)),
    id,
  )
}

/** Puts car `id` back on sale, as it was, if it's in the shop. */
export function returnFromShop(inventory: InventoryCar[], id: string): InventoryCar[] {
  const car = inventory.find((c) => c.id === id)
  if (car?.status !== 'recon') return inventory
  return inventory.map((c) => (c === car ? { ...c, status: 'available' } : c))
}

/** What deciding on reconditioning needs to know. */
export interface ReconBook {
  inventory: readonly InventoryCar[]
  customers: readonly Customer[]
  /** Bays up today. */
  bays: number
  /** Mechanics on the payroll (not let go). */
  mechanics: number
  /** The doors are shut for the day. */
  closed: boolean
}

/** Why used car `id` can't go to the shop now, or null if it can. */
export function reconBlocker(book: ReconBook, id: string): string | null {
  if (book.bays === 0) return 'You need a service garage first.'
  const car = book.inventory.find((c) => c.id === id)
  if (!car || car.status === 'sold') return 'That car has been sold.'
  if (car.status === 'recon') return "It's in the shop already."
  if (!car.used) return 'Only used cars need reconditioning.'
  if (car.used.condition >= RECON_MAX) return "It's in good enough shape."
  if (book.closed) return 'The shop is closed for the day.'
  if (book.mechanics === 0) return 'Hire a mechanic first.'
  const wanted = book.customers.some(
    (c) => c.phase !== 'leaving' && (c.targetCarId === id || c.offer?.carId === id),
  )
  if (wanted) return 'A customer is looking at it.'
  return null
}

/**
 * A reconditioning job for car `carId`, its parts rolled at `partsCost` (paid
 * when it's booked). Nobody pays for its labor: it's our own car.
 */
export function reconJob(id: string, carId: string, partsCost: number): ServiceJob {
  return {
    id,
    kind: 'recon',
    customerId: null,
    carId,
    bay: null,
    mechanicId: null,
    status: 'waiting',
    worked: 0,
    minutes: JOBS.recon.minutes,
    labor: 0,
    parts: 0,
    partsCost,
    finding: null,
    client: null,
    readyMinute: null,
  }
}

/** The parts a reconditioning job needs, rolled like any quote's. */
export function reconPartsCost(rng: Rng): number {
  return quote('recon', 'standard', rng).partsCost
}

/**
 * Which waiting job a mechanic takes first: clients' cars (15c), then recalls
 * (15e), then our own reconditioning.
 */
export function jobPriority(job: Pick<ServiceJob, 'kind'>): number {
  if (job.kind === 'recon') return 2
  if (job.kind === 'recall') return 1
  return 0
}

/** Jobs in the bays, being worked on (or stalled for want of a mechanic). */
export function jobsInBays(jobs: readonly ServiceJob[]): ServiceJob[] {
  return jobs.filter((j) => j.status === 'inBay')
}

/** Mechanics work off the clock at this rate, $ an hour, to finish a job after closing. */
export const OVERTIME_HOURLY = 45

/** What finishing `job` after closing costs in overtime. */
export function overtimeFor(job: ServiceJob): number {
  return Math.round((Math.max(0, job.minutes - job.worked) / 60) * OVERTIME_HOURLY)
}

/** Game minutes left on `job`. */
export function minutesLeft(job: ServiceJob): number {
  return Math.max(0, job.minutes - job.worked)
}

/**
 * `jobs` after `minutes` more on the clock: each one in a bay whose mechanic
 * is `working` gets the time, and is ready (a client's) or done (ours) once
 * it has had all it needs. Returns the same array when nothing moved.
 */
export function workJobs(
  jobs: ServiceJob[],
  minutes: number,
  working: (mechanicId: string | null) => boolean,
): ServiceJob[] {
  if (minutes <= 0) return jobs
  let changed = false
  const next = jobs.map((j) => {
    if (j.status !== 'inBay' || !working(j.mechanicId)) return j
    changed = true
    return withWork(j, j.worked + minutes)
  })
  return changed ? next : jobs
}

/** `job` with `worked` minutes on it, finished if that's all it needs. */
function withWork(job: ServiceJob, worked: number): ServiceJob {
  if (worked < job.minutes) return { ...job, worked }
  return { ...job, worked: job.minutes, status: job.customerId ? 'ready' : 'done' }
}

/** `job` finished off after closing, in overtime. */
export function finishedLate(job: ServiceJob): ServiceJob {
  return withWork(job, job.minutes)
}

/** A client's job, at the `quote` they took. Its time is set again by whoever starts it. */
export function clientJob(
  id: string,
  kind: JobKind,
  customerId: string,
  q: Quote,
  client: NonNullable<ServiceJob['client']>,
): ServiceJob {
  return {
    id,
    kind,
    customerId,
    carId: null,
    bay: null,
    mechanicId: null,
    status: 'waiting',
    worked: 0,
    minutes: JOBS[kind].minutes,
    labor: q.labor,
    parts: q.parts,
    partsCost: q.partsCost,
    finding: null,
    client,
    readyMinute: null,
  }
}

/** What a client pays for the job quoted: labor and parts. */
export function quoteTotal(q: Pick<Quote, 'labor' | 'parts'>): number {
  return q.labor + q.parts
}

/** Game minutes added to a promise for the car getting to the bay and the mechanic to it. */
export const PROMISE_SLACK = 10

/**
 * When a `kind` job booked at `now` will be ready: after the work already in
 * the bays and the clients' (and recalls') jobs waiting ahead of it, shared
 * between the `mechanics`, plus its own book time and `PROMISE_SLACK`, rounded up to the next 10
 * minutes. Our own reconditioning waits behind clients. Null with nobody to
 * do the work.
 */
export function promiseMinute(
  now: number,
  jobs: readonly ServiceJob[],
  kind: JobKind,
  mechanics: number,
): number | null {
  if (mechanics <= 0) return null
  const rank = jobPriority({ kind })
  const ahead = jobs
    .filter((j) => j.status === 'inBay' || (j.status === 'waiting' && jobPriority(j) <= rank))
    .reduce((sum, j) => sum + minutesLeft(j), 0)
  const ready = now + ahead / mechanics + JOBS[kind].minutes + PROMISE_SLACK
  return Math.ceil(ready / 10) * 10
}

/** Whether a job promised for `promised` can still be done before closing. */
export function inTime(promised: number | null): promised is number {
  return promised !== null && promised <= CLOSE_MINUTE
}

/**
 * `jobs` with the clients' cars that have just come ready stamped with
 * `minute`. Returns the same array when none have.
 */
export function stampReady(jobs: ServiceJob[], minute: number): ServiceJob[] {
  if (!jobs.some((j) => j.status === 'ready' && j.readyMinute === null)) return jobs
  return jobs.map((j) =>
    j.status === 'ready' && j.readyMinute === null ? { ...j, readyMinute: minute } : j,
  )
}

/** Whether a client's `job` was ready after the time they were promised. */
export function wasLate(job: ServiceJob, promised: number | null): boolean {
  return promised !== null && job.readyMinute !== null && job.readyMinute > promised
}
