import { STAFF_VARIANTS, type StaffVariant } from './characters'
import { randomName } from './customers'
import type { Sale } from './deal'
import { DESK_CHAIR_ID, RECEPTION_CHAIR_ID, SALES_DESKS, type SalesDesk } from './layout'
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
 * now; a fired employee is removed once they've left.
 */
export type Role = 'sales' | 'receptionist' | 'finance' | 'porter'

export const ROLES: readonly Role[] = ['sales', 'receptionist', 'finance', 'porter']

export const ROLE_LABELS: Record<Role, string> = {
  sales: 'Salesperson',
  receptionist: 'Receptionist',
  finance: 'Finance manager',
  porter: 'Lot porter',
}
const ROLE_PLURALS: Record<Role, string> = {
  sales: 'salespeople',
  receptionist: 'receptionist',
  finance: 'finance manager',
  porter: 'lot porter',
}
/** Short label for the badge over their head. */
export const ROLE_BADGES: Record<Role, string> = {
  sales: 'Sales',
  receptionist: 'Reception',
  finance: 'Finance',
  porter: 'Porter',
}

/** Most of each role on the payroll at once. */
export const ROLE_LIMITS: Record<Role, number> = {
  sales: 2,
  receptionist: 1,
  finance: 1,
  porter: 1,
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
}

export const MIN_SKILL = 1
export const MAX_SKILL = 5

/** Daily wage: a base per role plus a raise per skill level. */
const WAGES: Record<Role, { base: number; perSkill: number }> = {
  sales: { base: 90, perSkill: 30 },
  receptionist: { base: 70, perSkill: 20 },
  finance: { base: 110, perSkill: 35 },
  porter: { base: 60, perSkill: 15 },
}

/** Share of a car's price a salesperson earns for selling it. */
export const SALES_COMMISSION = 0.03

/** Flat fee the finance manager earns for each deal they sign. */
export const FINANCE_FEE = 200

/** Game seconds of paperwork per deal for an average (skill 3) finance manager. */
export const FINANCE_SECONDS = 6
/** Game seconds an average salesperson spends talking up the car before making an offer. */
export const SALES_PITCH_SECONDS = 4
/** Game seconds of paperwork per deal for an average salesperson at their own desk. */
export const SALES_SIGN_SECONDS = 6
/** Each skill level above or below average takes this much off a task's time or adds it on. */
const SKILL_TIME_STEP = 0.15

/** Walking speed in the world, units per second: a touch brisker than customers. */
export const STAFF_SPEED = 1.8

/** Multiplier on waiting customers' patience drain while a receptionist is at the desk. */
export const RECEPTION_PATIENCE_FACTOR = 0.5

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
 * the salespeople on the lot. Null if they aren't one, or all desks are taken
 * (a let-go salesperson still finishing up can hold one past the limit).
 */
export function salesDeskOf(roster: readonly Employee[], id: string): SalesDesk | null {
  const sales = roster.filter((e) => e.role === 'sales' && e.status !== 'off')
  const i = sales.findIndex((e) => e.id === id)
  return i < 0 ? null : (SALES_DESKS[i] ?? null)
}

/** The chair employee `e` works from, or null if they stand. */
export function postChairId(e: Employee, roster: readonly Employee[]): string | null {
  return e.role === 'sales' ? (salesDeskOf(roster, e.id)?.chairId ?? null) : POSTS[e.role]
}

/**
 * The day's applicants: one for each role in random order, sometimes plus one
 * more of any role, so every role can be filled on any day.
 */
export function generateCandidates(rng: Rng, day: number): Employee[] {
  const roles = [...ROLES]
  for (let i = roles.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[roles[i], roles[j]] = [roles[j], roles[i]]
  }
  if (rng.next() < 0.5) roles.push(rng.pick(ROLES))
  return roles.map((role, i) => {
    const skill = rng.int(MIN_SKILL, MAX_SKILL)
    return {
      id: `staff-${day}-${i + 1}`,
      name: randomName(rng),
      variant: rng.pick(STAFF_VARIANTS),
      role,
      skill,
      wage: wageFor(role, skill),
      status: 'off',
      fired: false,
    }
  })
}

/** Whether they're in the middle of something firing shouldn't interrupt. Nobody is yet. */
export function isBusy(_employee: Employee): boolean {
  return false
}

/** Why another `role` can't be hired, or null if they can. */
export function canHire(roster: readonly Employee[], role: Role): string | null {
  const count = roster.filter((e) => e.role === role && !e.fired).length
  const limit = ROLE_LIMITS[role]
  if (count < limit) return null
  return limit === 1
    ? `You already have a ${ROLE_PLURALS[role]}.`
    : `You already have ${limit} ${ROLE_PLURALS[role]}.`
}

/**
 * What the day's staff cost, paid at closing: wages for everyone still on the
 * payroll, and what staff earned on today's `sales` (even if let go since).
 */
export function payroll(
  roster: readonly Employee[],
  sales: readonly Sale[],
): { wages: number; commissions: number } {
  const wages = roster.filter((e) => !e.fired).reduce((sum, e) => sum + e.wage, 0)
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
  /** Closing time: everyone heads home. */
  | { type: 'close' }
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
      return [...roster, { ...ev.employee, status: ev.open ? 'arriving' : 'off', fired: false }]
    case 'open': {
      const kept = roster.filter((e) => !e.fired)
      const next = mapChanged(kept, (e) =>
        e.status === 'off' || e.status === 'leaving' ? { ...e, status: 'arriving' } : e,
      )
      return next === kept && kept.length === roster.length ? roster : next
    }
    case 'close':
      return mapChanged(roster, (e) =>
        e.status === 'arriving' || e.status === 'atPost' ? { ...e, status: 'leaving' } : e,
      )
  }
  const e = roster.find((x) => x.id === ev.id)
  if (!e) return roster
  let n: Employee | null = e
  switch (ev.type) {
    case 'fire':
      if (e.fired) return roster
      if (e.status === 'off') n = null
      else n = { ...e, fired: true, status: isBusy(e) ? e.status : 'leaving' }
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
