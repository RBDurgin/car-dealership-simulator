import { formatMoney } from './format'
import { createRng, hashSeed, type Rng } from './rng'
import { MAX_SKILL, wageFor, type Employee, type Role } from './staff'

/**
 * Staff growth: the work each employee does in a day earns experience, and
 * experience raises their skill a step at a time, up to the `potential` each
 * hire comes with. A level-up comes with a request for the new level's wage,
 * which the player grants or declines (unanswered, it lapses).
 *
 * Worked out once a day, in `settleDay`, from the day's `WorkTally`s.
 */

/** What one employee did today, counted by the store actions that do the work. */
export interface WorkTally {
  /** Reached their post today. */
  came: boolean
  /** Cars they sold (as the seller, wherever it was signed). */
  sales: number
  /** Deals they signed at their desk (the finance manager's, or a salesperson's own). */
  signings: number
  /** Test drives a salesperson took a shopper on. */
  drives: number
  /** Cars a porter washed. */
  washes: number
  /** Service clients an advisor checked in. */
  checkIns: number
  /** Extra work an advisor sold a service client. */
  findings: number
  /** Calls a receptionist made from the client book. */
  calls: number
  /** Of those, the ones that booked an appointment. */
  bookings: number
  /** Jobs a mechanic finished in a bay. */
  jobs: number
  /** Times a guard ran Nazma off. */
  chases: number
}

export type WorkCount = Exclude<keyof WorkTally, 'came'>

export function emptyTally(): WorkTally {
  return {
    came: false,
    sales: 0,
    signings: 0,
    drives: 0,
    washes: 0,
    checkIns: 0,
    findings: 0,
    calls: 0,
    bookings: 0,
    jobs: 0,
    chases: 0,
  }
}

/** Today's tallies, by employee id. */
export type StaffWork = Record<string, WorkTally>

/** `work` with `n` more `count` for employee `id` (or `came` set). */
export function addWork(work: StaffWork, id: string, count: WorkCount | 'came', n = 1): StaffWork {
  const t = work[id] ?? emptyTally()
  if (count === 'came') return t.came ? work : { ...work, [id]: { ...t, came: true } }
  return { ...work, [id]: { ...t, [count]: t[count] + n } }
}

/** Experience each piece of work earns. */
export const XP_VALUES: Record<WorkCount, number> = {
  sales: 4,
  signings: 2,
  drives: 1,
  washes: 1,
  checkIns: 2,
  findings: 2,
  calls: 0.5,
  bookings: 2,
  jobs: 3,
  chases: 5,
}

/** Experience for coming in at all, so a quiet day (or role) still counts. */
export const XP_PER_DAY = 6

/**
 * Experience from each skill to the next: with a steady day's work worth
 * about 10, three to four weeks a level.
 */
export const XP_TO_LEVEL: Readonly<Record<number, number>> = { 1: 200, 2: 240, 3: 280, 4: 320 }

/** Days a raise request waits for an answer before it lapses (as a decline). */
export const RAISE_ASK_DAYS = 3

/** Experience from `skill` to the next level; infinite at the top. */
export function xpToLevel(skill: number): number {
  return XP_TO_LEVEL[skill] ?? Infinity
}

/** The experience a day of `tally` earns. */
export function xpFor(tally: WorkTally | undefined): number {
  if (!tally) return 0
  let xp = tally.came ? XP_PER_DAY : 0
  for (const k of Object.keys(XP_VALUES) as WorkCount[]) xp += tally[k] * XP_VALUES[k]
  return xp
}

/** The skill `e` can still grow to. */
export function ceilingOf(e: Pick<Employee, 'potential'>): number {
  return Math.min(MAX_SKILL, e.potential)
}

/**
 * `e` with `xp` more experience (× `scale`, the level's `staffGrowth`),
 * levelled up a step at a time while it covers the next level. At their
 * ceiling the bar fills and waits (a later course or a higher potential
 * takes it from there); at `MAX_SKILL` it stays empty.
 */
export function grow(e: Employee, xp: number, scale = 1): Employee {
  let skill = e.skill
  let total = e.xp + Math.round(xp * scale)
  const ceiling = ceilingOf(e)
  while (skill < ceiling && total >= xpToLevel(skill)) {
    total -= xpToLevel(skill)
    skill++
  }
  if (skill >= MAX_SKILL) total = 0
  else if (skill >= ceiling) total = Math.min(total, xpToLevel(skill))
  return skill === e.skill && total === e.xp ? e : { ...e, skill, xp: total }
}

/** Share of the next level's experience filled, 0–1 (1 at the top). */
export function levelProgress(e: Pick<Employee, 'skill' | 'xp'>): number {
  const need = xpToLevel(e.skill)
  return need === Infinity ? 1 : Math.min(1, e.xp / need)
}

/** How a potential above the hire's skill is spread: +0, +1, +2, +3. */
const POTENTIAL_ODDS = [0.15, 0.4, 0.35, 0.1]

/**
 * The most a hire of `skill` can grow to: never below their skill, usually
 * one or two above it, and never over `MAX_SKILL`. Always one draw from `rng`.
 */
export function potentialOf(rng: Rng, skill: number): number {
  let roll = rng.next()
  let extra = 0
  while (extra < POTENTIAL_ODDS.length - 1 && roll >= POTENTIAL_ODDS[extra]) {
    roll -= POTENTIAL_ODDS[extra]
    extra++
  }
  return Math.min(MAX_SKILL, skill + extra)
}

/** A potential for someone hired before there was one, from their id (for older saves). */
export function potentialFromId(id: string, skill: number): number {
  return potentialOf(createRng(hashSeed(`potential-${id}`)), skill)
}

/** Someone who levelled up today, for the summary and the next morning's notice. */
export interface LevelUp {
  id: string
  name: string
  role: Role
  skill: number
  /** The wage they asked for, or null if they're already paid that. */
  ask: number | null
}

/**
 * The roster at the end of `day`, from the day's `work`: raise requests left
 * unanswered `RAISE_ASK_DAYS` lapse, everyone still on the payroll gains the
 * day's experience, and each who levels up asks for the new level's wage
 * (unless they're already paid that). The same roster when nothing changed.
 */
export function growStaff(
  roster: Employee[],
  work: StaffWork,
  day: number,
  scale = 1,
): { roster: Employee[]; levelUps: LevelUp[]; lapsed: string[] } {
  const levelUps: LevelUp[] = []
  const lapsed: string[] = []
  let changed = false
  const next = roster.map((e) => {
    if (e.fired) return e
    let n = e
    if (n.raiseAsk && day - n.raiseAsk.day >= RAISE_ASK_DAYS) {
      lapsed.push(n.name)
      n = { ...n, raiseAsk: null }
    }
    n = withLevelUp(grow(n, xpFor(work[e.id]), scale), n.skill, day, levelUps)
    if (n !== e) changed = true
    return n
  })
  return { roster: changed ? next : roster, levelUps, lapsed }
}

/**
 * `e` (after growing from `before`) with a raise request if they levelled
 * up and the new level pays more, and the level-up added to `levelUps`.
 */
export function withLevelUp(
  e: Employee,
  before: number,
  day: number,
  levelUps: LevelUp[],
): Employee {
  if (e.skill <= before) return e
  const wage = wageFor(e.role, e.skill)
  const ask = wage > e.wage ? wage : null
  levelUps.push({ id: e.id, name: e.name, role: e.role, skill: e.skill, ask })
  return { ...e, raiseAsk: ask === null ? null : { wage: ask, day } }
}

/** The morning's word on yesterday's level-ups and lapsed raise requests. */
export function levelUpNotice(levelUps: readonly LevelUp[], lapsed: readonly string[] = []) {
  const parts = levelUps.map((u) =>
    u.ask === null
      ? `${u.name} grew to skill ${u.skill}.`
      : `${u.name} grew to skill ${u.skill} and asks for ${formatMoney(u.ask)} a day: answer in the Staff panel.`,
  )
  if (lapsed.length > 0) {
    parts.push(`${lapsed.join(' and ')} gave up waiting for an answer on a raise.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
