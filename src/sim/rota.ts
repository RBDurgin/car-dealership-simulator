import { DAYS_PER_WEEK, weekdayLabel, WEEKDAY_TRAFFIC } from './calendar'
import { SERVICE_WEEKDAY } from './service'
import { onShift, ROLE_LABELS, type Employee, type Role } from './staff'

export { onShift }

/**
 * The weekly rota: the weekdays each employee doesn't come in. The pattern
 * repeats every week, a day off isn't paid, and someone who works more than
 * `FATIGUE_DAYS` in a row tires (see `sim/morale.ts`). The auto
 * rota keeps every role covered where it can, keeps the busy days full and
 * gives the garage's staff the days the shop is shut.
 */

/** Traffic at or over this (Friday, Saturday) and a rota keeps everyone in. */
const BUSY_TRAFFIC = 1.1

/** The garage's staff, who have the days it's shut off. */
const SHOP_ROLES: readonly Role[] = ['mechanic', 'advisor']

export const WEEK = Array.from({ length: DAYS_PER_WEEK }, (_, w) => w)

/** Weekdays (0 = Monday) the service garage is shut: Sunday. */
export const SHOP_SHUT = WEEK.filter((w) => SERVICE_WEEKDAY[w] === 0)

/** Weekdays a rota keeps full: the busiest ones (Friday and Saturday). */
export const FULL_DAYS = WEEK.filter((w) => WEEKDAY_TRAFFIC[w] >= BUSY_TRAFFIC)

/** The other weekdays, quietest first (Sunday, then Monday, …). */
const QUIET_DAYS = WEEK.filter((w) => !FULL_DAYS.includes(w)).sort(
  (a, b) => WEEKDAY_TRAFFIC[a] - WEEKDAY_TRAFFIC[b],
)

type RotaPerson = Pick<Employee, 'id' | 'role' | 'fired' | 'daysOff'>

/** Those on the payroll (not let go) whose day off `day` is. */
export function offOn<E extends RotaPerson>(roster: readonly E[], day: number): E[] {
  return roster.filter((e) => !e.fired && !onShift(e, day))
}

function isShopRole(role: Role): boolean {
  return SHOP_ROLES.includes(role)
}

/** Days off each of `count` in `role` gets: the shop's shut days, else two with spare cover (3 or more), else one. */
function daysOffEach(role: Role, count: number): number {
  if (isShopRole(role)) return SHOP_SHUT.length
  return count >= 3 ? 2 : 1
}

/**
 * Days off for one of `count` in `role`, given who's off already: `load`
 * (everyone, per weekday) and `roleLoad` (their role). Each goes on the quiet
 * day their role is thinnest on, then the one fewest are off, then the
 * quietest, never leaving the role with nobody unless there's only one of
 * them. The loads are counted on.
 */
function pickDaysOff(role: Role, count: number, load: number[], roleLoad: number[]): number[] {
  if (isShopRole(role)) {
    for (const w of SHOP_SHUT) load[w]++
    return [...SHOP_SHUT]
  }
  const cap = Math.max(1, count - 1)
  const picks: number[] = []
  for (let i = 0; i < daysOffEach(role, count); i++) {
    let best = -1
    for (const w of QUIET_DAYS) {
      if (picks.includes(w) || roleLoad[w] >= cap) continue
      if (
        best < 0 ||
        roleLoad[w] < roleLoad[best] ||
        (roleLoad[w] === roleLoad[best] && load[w] < load[best])
      ) {
        best = w
      }
    }
    if (best < 0) break
    picks.push(best)
    load[best]++
    roleLoad[best]++
  }
  return picks.sort((a, b) => a - b)
}

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((w, i) => w === b[i])

/**
 * Everyone on the payroll given days off afresh, in roster order: one each,
 * two in a role with spare cover, the garage's staff on the days it's shut.
 * Returns the same array when nobody's days change.
 */
export function autoRota<E extends RotaPerson>(roster: E[]): E[] {
  const load = new Array<number>(DAYS_PER_WEEK).fill(0)
  const byRole = new Map<Role, number[]>()
  const counts = new Map<Role, number>()
  for (const e of roster) if (!e.fired) counts.set(e.role, (counts.get(e.role) ?? 0) + 1)
  let changed = false
  const next = roster.map((e) => {
    if (e.fired) return e
    let roleLoad = byRole.get(e.role)
    if (!roleLoad) byRole.set(e.role, (roleLoad = new Array<number>(DAYS_PER_WEEK).fill(0)))
    const daysOff = pickDaysOff(e.role, counts.get(e.role) ?? 1, load, roleLoad)
    if (sameDays(daysOff, e.daysOff)) return e
    changed = true
    return { ...e, daysOff }
  })
  return changed ? next : roster
}

/** Days off for `hire` joining `roster`, fitted round everyone else's. */
export function rotaForHire(roster: readonly RotaPerson[], hire: Pick<Employee, 'role'>): number[] {
  const load = new Array<number>(DAYS_PER_WEEK).fill(0)
  const roleLoad = new Array<number>(DAYS_PER_WEEK).fill(0)
  let count = 1
  for (const e of roster) {
    if (e.fired) continue
    for (const w of e.daysOff) load[w]++
    if (e.role !== hire.role) continue
    count++
    for (const w of e.daysOff) roleLoad[w]++
  }
  return pickDaysOff(hire.role, count, load, roleLoad)
}

/** `e`'s days off with `weekday` switched on or off. */
export function toggleDayOff(daysOff: readonly number[], weekday: number): number[] {
  return daysOff.includes(weekday)
    ? daysOff.filter((w) => w !== weekday)
    : [...daysOff, weekday].sort((a, b) => a - b)
}

export interface CoverageGap {
  role: Role
  weekday: number
}

/**
 * The weekdays a role on the payroll has nobody in, in weekday then role
 * order. The garage's staff aren't missed on the days it's shut.
 */
export function coverageGaps(roster: readonly RotaPerson[]): CoverageGap[] {
  const roles = new Map<Role, RotaPerson[]>()
  for (const e of roster) {
    if (e.fired) continue
    const list = roles.get(e.role)
    if (list) list.push(e)
    else roles.set(e.role, [e])
  }
  const gaps: CoverageGap[] = []
  for (const weekday of WEEK) {
    for (const [role, people] of roles) {
      if (isShopRole(role) && SHOP_SHUT.includes(weekday)) continue
      if (people.every((e) => e.daysOff.includes(weekday))) gaps.push({ role, weekday })
    }
  }
  return gaps
}

/** "Sun" or "Tue, Thu", or "None". */
export function daysOffText(daysOff: readonly number[]): string {
  return daysOff.length > 0 ? daysOff.map((w) => weekdayLabel(w)).join(', ') : 'None'
}

/** "No salesperson on Tuesday". */
export function gapText(g: CoverageGap): string {
  return `No ${ROLE_LABELS[g.role].toLowerCase()} on ${weekdayLabel(g.weekday, true)}`
}

/**
 * The roster with today's streaks counted: on for everyone who worked (not
 * in `off`), back to 0 for those who had the day off. The let-go are left as
 * they are. Returns the same array when nothing changed.
 */
export function countStreaks<E extends Pick<Employee, 'id' | 'fired' | 'streak'>>(
  roster: E[],
  off: readonly string[],
): E[] {
  let changed = false
  const next = roster.map((e) => {
    if (e.fired) return e
    const streak = off.includes(e.id) ? 0 : e.streak + 1
    if (streak === e.streak) return e
    changed = true
    return { ...e, streak }
  })
  return changed ? next : roster
}

/** The morning's word on who's off today, or null if everyone's in. */
export function offNotice(off: readonly Pick<Employee, 'name'>[]): string | null {
  if (off.length === 0) return null
  const names = off.map((e) => e.name)
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${who} ${off.length === 1 ? 'has' : 'have'} the day off.`
}
