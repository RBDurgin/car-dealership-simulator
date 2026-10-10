import { GUARD_VARIANT, STAFF_VARIANTS, type StaffVariant } from './characters'
import { randomName } from './customers'
import type { Sale } from './deal'
import {
  DESK_CHAIR_ID,
  RECEPTION_CHAIR_ID,
  salesDesks,
  SERVICE_CHAIR_ID,
  serviceBays,
  type ExpansionId,
  type SalesDesk,
} from './layout'
import type { Rng } from './rng'

/**
 * The dealership's employees: who can be hired, what they cost, and where they
 * are in their working day. The world (scene/Staff) walks them to their posts
 * and reports progress as events, like customers.
 *
 *   off ─open─► arriving ─atPost─► atPost ─close─► leaving ─left─► off
 *                   └─────────────close────────────────┘
 *
 * `open` also sends anyone still walking out back to work (a new day started
 * before they reached the sidewalk). Firing an idle employee sends them home
 * now; a fired employee is removed once they've left. Someone Nazma poached is
 * `quitting` until kept with a raise; at `close` they walk out for good.
 */
export type Role =
  'sales' | 'receptionist' | 'finance' | 'porter' | 'security' | 'mechanic' | 'advisor'

export const ROLES: readonly Role[] = [
  'sales',
  'receptionist',
  'finance',
  'porter',
  'security',
  'mechanic',
  'advisor',
]

export const ROLE_LABELS: Record<Role, string> = {
  sales: 'Salesperson',
  receptionist: 'Receptionist',
  finance: 'Finance manager',
  porter: 'Lot porter',
  security: 'Security guard',
  mechanic: 'Mechanic',
  advisor: 'Service advisor',
}
const ROLE_PLURALS: Record<Role, string> = {
  sales: 'salespeople',
  receptionist: 'receptionists',
  finance: 'finance managers',
  porter: 'lot porters',
  security: 'security guards',
  mechanic: 'mechanics',
  advisor: 'service advisors',
}
/** What each role does, for applicants in the staff panel. */
export const ROLE_BLURBS: Record<Role, string> = {
  sales: 'Sells on their own. Skill sets how firmly they haggle and how often customers say yes.',
  receptionist: 'Keeps waiting customers patient.',
  finance: 'Signs buyers at your office desk, so you can sell to the next one.',
  porter: 'Washes the dirtiest cars on the lot.',
  security: 'Patrols the lot, chases off Nazma and makes his visits rarer.',
  mechanic: 'Works a bay in the service garage. Skill sets how fast.',
  advisor: "Checks service clients in at the garage counter, so you don't have to.",
}
/** Short label for the badge over their head. */
export const ROLE_BADGES: Record<Role, string> = {
  sales: 'Sales',
  receptionist: 'Reception',
  finance: 'Finance',
  porter: 'Porter',
  security: 'Security',
  mechanic: 'Mechanic',
  advisor: 'Service',
}

/**
 * Most of each role on the payroll at once, before the showroom wing and the
 * garage. No mechanics or service advisor until there's a garage to work in.
 */
export const ROLE_LIMITS: Record<Role, number> = {
  sales: 2,
  receptionist: 1,
  finance: 1,
  porter: 1,
  security: 1,
  mechanic: 0,
  advisor: 0,
}

/** With the showroom wing up: a desk for each of 4 salespeople, and 2 porters for the bigger lot. */
const WING_LIMITS: Partial<Record<Role, number>> = { sales: 4, porter: 2 }

/**
 * Most of each role on the payroll at once with the `expansions` that are up:
 * a mechanic per bay, and a service advisor once there's a garage.
 */
export function roleLimits(expansions: readonly ExpansionId[] = []): Record<Role, number> {
  const wing = expansions.includes('showroom-wing')
  const bays = serviceBays(expansions).length
  if (!wing && !bays) return ROLE_LIMITS
  return { ...ROLE_LIMITS, ...(wing && WING_LIMITS), mechanic: bays, advisor: bays > 0 ? 1 : 0 }
}

/**
 * The chair each role works from, if it has one. Salespeople each have their
 * own desk instead (see `salesDeskOf`).
 */
export const POSTS: Record<Role, string | null> = {
  sales: null,
  receptionist: RECEPTION_CHAIR_ID,
  finance: DESK_CHAIR_ID,
  porter: null,
  security: null,
  mechanic: null,
  advisor: SERVICE_CHAIR_ID,
}

export type StaffStatus = 'off' | 'arriving' | 'atPost' | 'leaving'

export interface Employee {
  id: string
  name: string
  variant: StaffVariant
  role: Role
  /** 1 (green) to 5 (seasoned). */
  skill: number
  /** Paid at the end of each day they're on the payroll. */
  wage: number
  status: StaffStatus
  /** Let go: walks out and is removed once off the lot. Not paid for the day. */
  fired: boolean
  /**
   * Nazma talked them into leaving: they quit at closing unless kept with a
   * raise. A quitter stays `quitting` once gone, so they're still paid for the day.
   */
  quitting: boolean
}

export const MIN_SKILL = 1
export const MAX_SKILL = 5

/** Daily wage: a base per role plus a raise per skill level. */
const WAGES: Record<Role, { base: number; perSkill: number }> = {
  sales: { base: 90, perSkill: 30 },
  receptionist: { base: 70, perSkill: 20 },
  finance: { base: 110, perSkill: 35 },
  porter: { base: 60, perSkill: 15 },
  security: { base: 80, perSkill: 20 },
  mechanic: { base: 100, perSkill: 30 },
  advisor: { base: 80, perSkill: 25 },
}

/** Share of a sale's gross profit (price less cost) a salesperson earns for making it. */
export const SALES_COMMISSION = 0.25
/** The least a salesperson earns on a sale, however thin the margin (a "mini"). */
export const MIN_COMMISSION = 100

/** Flat fee the finance manager earns for each deal they sign. */
export const FINANCE_FEE = 200

/** Game seconds of paperwork per deal for an average (skill 3) finance manager. */
export const FINANCE_SECONDS = 6
/** Game seconds an average salesperson spends talking up the car before making an offer. */
export const SALES_PITCH_SECONDS = 4
/** Game seconds an average salesperson takes to come back with a new price after a counter. */
export const SALES_COUNTER_SECONDS = 2
/** Game seconds of paperwork per deal for an average salesperson at their own desk. */
export const SALES_SIGN_SECONDS = 6
/** Game seconds an average service advisor takes to check a client in. */
export const ADVISOR_CHECK_IN_SECONDS = 4
/** Game seconds an average service advisor takes to talk a client through extra work. */
export const ADVISOR_CALL_SECONDS = 6
/** Game seconds an average lot porter takes to wash a car. */
export const PORTER_WASH_SECONDS = 8
/** Each skill level above or below average takes this much off a task's time or adds it on. */
const SKILL_TIME_STEP = 0.15

/** Walking speed in the world, units per second: a touch brisker than customers. */
export const STAFF_SPEED = 1.8
/** A security guard running after Nazma: quicker than he can run off. */
export const GUARD_CHASE_SPEED = 3

/** Share of their wage a raise to keep someone from quitting adds. */
export const RETENTION_RAISE = 0.2
/** The least such a raise can be, per day. */
export const MIN_RETENTION_RAISE = 20

/** Multiplier on waiting customers' patience drain while a receptionist is at the desk. */
export const RECEPTION_PATIENCE_FACTOR = 0.5

/** What a salesperson earns for selling a car that cost `cost` at `price`. */
export function salesCommission(price: number, cost: number): number {
  return Math.max(MIN_COMMISSION, Math.round((price - cost) * SALES_COMMISSION))
}

/** What keeping someone on `wage` from quitting adds to it each day. */
export function retentionRaise(wage: number): number {
  return Math.max(MIN_RETENTION_RAISE, Math.round(wage * RETENTION_RAISE))
}

export function wageFor(role: Role, skill: number): number {
  const w = WAGES[role]
  return w.base + w.perSkill * skill
}

/** Game seconds an employee of `skill` takes over a task an average one does in `base`. */
export function skillSeconds(base: number, skill: number): number {
  return base * (1 + (3 - skill) * SKILL_TIME_STEP)
}

/** Game seconds a finance manager of `skill` takes over one deal's paperwork. */
export function financeSeconds(skill: number): number {
  return skillSeconds(FINANCE_SECONDS, skill)
}

/**
 * The desk salesperson `id` works from: handed out in roster (hiring) order to
 * the salespeople on the lot, from the desks standing with the `expansions`
 * up. Null if they aren't one, or all desks are taken (a let-go salesperson
 * still finishing up can hold one past the limit).
 */
export function salesDeskOf(
  roster: readonly Employee[],
  id: string,
  expansions: readonly ExpansionId[] = [],
): SalesDesk | null {
  const sales = roster.filter((e) => e.role === 'sales' && e.status !== 'off')
  const i = sales.findIndex((e) => e.id === id)
  return i < 0 ? null : (salesDesks(expansions)[i] ?? null)
}

/** The chair employee `e` works from (with the `expansions` up), or null if they stand. */
export function postChairId(
  e: Employee,
  roster: readonly Employee[],
  expansions: readonly ExpansionId[] = [],
): string | null {
  return e.role === 'sales'
    ? (salesDeskOf(roster, e.id, expansions)?.chairId ?? null)
    : POSTS[e.role]
}

/** Staff models for everyone but the guard, who wears the police uniform. */
const WORKER_VARIANTS = STAFF_VARIANTS.filter((v) => v !== GUARD_VARIANT)

/**
 * The model someone in `role` wears: the police uniform for a guard, otherwise
 * `variant`, or a stand-in when that's the uniform or a model no longer used.
 */
export function dressFor(role: Role, variant: unknown): StaffVariant {
  if (role === 'security') return GUARD_VARIANT
  return WORKER_VARIANTS.find((v) => v === variant) ?? WORKER_VARIANTS[0]
}

/**
 * The day's applicants: one for each role in random order, sometimes plus one
 * more of any role, so every role can be filled on any day. Only roles that
 * can be hired with the `expansions` up apply (no mechanics without a garage),
 * so the rolls are the same as before there were any.
 */
export function generateCandidates(
  rng: Rng,
  day: number,
  expansions: readonly ExpansionId[] = [],
): Employee[] {
  const limits = roleLimits(expansions)
  const open = ROLES.filter((r) => limits[r] > 0)
  const roles = [...open]
  for (let i = roles.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[roles[i], roles[j]] = [roles[j], roles[i]]
  }
  if (rng.next() < 0.5) roles.push(rng.pick(open))
  return roles.map((role, i) => {
    const skill = rng.int(MIN_SKILL, MAX_SKILL)
    return {
      id: `staff-${day}-${i + 1}`,
      name: randomName(rng),
      variant: role === 'security' ? GUARD_VARIANT : rng.pick(WORKER_VARIANTS),
      role,
      skill,
      wage: wageFor(role, skill),
      status: 'off',
      fired: false,
      quitting: false,
    }
  })
}

/** Whether they're in the middle of something firing shouldn't interrupt. Nobody is yet. */
export function isBusy(_employee: Employee): boolean {
  return false
}

/** Why another `role` can't be hired with the `expansions` up, or null if they can. */
export function canHire(
  roster: readonly Employee[],
  role: Role,
  expansions: readonly ExpansionId[] = [],
): string | null {
  const count = roster.filter((e) => e.role === role && !e.fired).length
  const limit = roleLimits(expansions)[role]
  if (count < limit) return null
  // Only the garage's staff need somewhere to work before they can be hired.
  if (limit === 0) return 'Build a service garage first.'
  return limit === 1
    ? `You already have a ${ROLE_LABELS[role].toLowerCase()}.`
    : `You already have ${limit} ${ROLE_PLURALS[role]}.`
}

/**
 * What the day's staff cost, paid at closing: wages for everyone still on the
 * payroll (and anyone who quit at closing, as they worked the day), and what
 * staff earned on today's `sales` (even if let go since).
 */
export function payroll(
  roster: readonly Employee[],
  sales: readonly Sale[],
): { wages: number; commissions: number } {
  const wages = roster.filter((e) => !e.fired || e.quitting).reduce((sum, e) => sum + e.wage, 0)
  const commissions = sales.reduce((sum, s) => sum + s.commission, 0)
  return { wages, commissions }
}

/**
 * The finance manager taking new buyers: on the way in or at the desk, and not
 * let go. Null if there's nobody, in which case the player signs deals themselves.
 */
export function financeOnDuty(roster: readonly Employee[]): Employee | null {
  return (
    roster.find(
      (e) => e.role === 'finance' && !e.fired && (e.status === 'arriving' || e.status === 'atPost'),
    ) ?? null
  )
}

/** Whether a security guard is on the payroll (not let go), which keeps Nazma away more often. */
export function isGuarded(roster: readonly Employee[]): boolean {
  return roster.some((e) => e.role === 'security' && !e.fired)
}

/**
 * Whether Nazma could talk `e` into quitting: on the payroll, not a guard (who
 * would rather run him off) and not already thinking of it.
 */
export function isPoachable(e: Employee): boolean {
  return !e.fired && !e.quitting && e.role !== 'security'
}

/** Whether a receptionist is at the desk: waiting customers lose patience more slowly. */
export function patienceFactor(roster: readonly Employee[]): number {
  return roster.some((e) => e.role === 'receptionist' && e.status === 'atPost')
    ? RECEPTION_PATIENCE_FACTOR
    : 1
}

export type StaffEvent =
  /** Joins the payroll; comes straight in if the doors are open. */
  | { type: 'hire'; employee: Employee; open: boolean }
  | { type: 'fire'; id: string }
  /** Doors open: everyone heads in, and the fired are gone for good. */
  | { type: 'open' }
  /** Reached their post. */
  | { type: 'atPost'; id: string }
  /** Closing time: everyone heads home, and anyone still quitting leaves for good. */
  | { type: 'close' }
  /** Nazma talked them round: they're thinking of quitting. */
  | { type: 'poached'; id: string }
  /** Kept from quitting with a raise to `wage`. */
  | { type: 'keep'; id: string; wage: number }
  /** Walked off the lot. */
  | { type: 'left'; id: string }

/**
 * The roster after `ev`. Returns the same array when nothing changed, and
 * ignores events that don't fit an employee's status (stale ones from the world).
 */
export function reduceStaff(roster: Employee[], ev: StaffEvent): Employee[] {
  switch (ev.type) {
    case 'hire':
      if (roster.some((e) => e.id === ev.employee.id)) return roster
      return [
        ...roster,
        { ...ev.employee, status: ev.open ? 'arriving' : 'off', fired: false, quitting: false },
      ]
    case 'open': {
      const kept = roster.filter((e) => !e.fired)
      const next = mapChanged(kept, (e) =>
        e.status === 'off' || e.status === 'leaving' ? { ...e, status: 'arriving' } : e,
      )
      return next === kept && kept.length === roster.length ? roster : next
    }
    case 'close':
      return mapChanged(roster, (e) => {
        if (e.quitting && !e.fired) return { ...e, fired: true, status: 'leaving' }
        return e.status === 'arriving' || e.status === 'atPost' ? { ...e, status: 'leaving' } : e
      })
  }
  const e = roster.find((x) => x.id === ev.id)
  if (!e) return roster
  let n: Employee | null = e
  switch (ev.type) {
    case 'fire':
      if (e.fired) return roster
      if (e.status === 'off') n = null
      else n = { ...e, fired: true, quitting: false, status: isBusy(e) ? e.status : 'leaving' }
      break
    case 'poached':
      if (isPoachable(e) && e.status !== 'off') n = { ...e, quitting: true }
      break
    case 'keep':
      if (e.quitting && !e.fired) n = { ...e, quitting: false, wage: ev.wage }
      break
    case 'atPost':
      if (e.status === 'arriving') n = { ...e, status: 'atPost' }
      break
    case 'left':
      if (e.status === 'leaving') n = e.fired ? null : { ...e, status: 'off' }
      break
  }
  if (n === e) return roster
  return n ? roster.map((x) => (x === e ? n : x)) : roster.filter((x) => x !== e)
}

function mapChanged(roster: Employee[], fn: (e: Employee) => Employee): Employee[] {
  let changed = false
  const next = roster.map((e) => {
    const n = fn(e)
    if (n !== e) changed = true
    return n
  })
  return changed ? next : roster
}
