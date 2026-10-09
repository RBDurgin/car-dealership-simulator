import { calendarOf } from './calendar'
import { OPEN_MINUTE } from './clock'
import type { Career } from './progression'
import type { Rng } from './rng'
import { MAX_SKILL, MIN_SKILL, skillSeconds } from './staff'

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
export const GARAGE_BAYS = 2
/** The expansion that builds the garage (added in 15b). */
export const GARAGE_EXPANSION = 'service-bay'

/** Bays standing with the `expansions` up: none until the garage is built. */
export function bayCount(expansions: readonly string[]): number {
  return expansions.includes(GARAGE_EXPANSION) ? GARAGE_BAYS : 0
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
 * The jobs of the visits due by `minute` that haven't spawned yet. Returns the
 * same schedule when none are due.
 */
export function takeDueVisits(
  schedule: ServiceSchedule,
  minute: number,
): { schedule: ServiceSchedule; due: JobKind[] } {
  let spawned = schedule.spawned
  while (spawned < schedule.minutes.length && schedule.minutes[spawned] <= minute) spawned++
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
  jobs: number
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
