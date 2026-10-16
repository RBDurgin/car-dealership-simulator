import { formatMoney } from './format'
import { moraleXp } from './morale'
import { createRng, hashSeed, type Rng } from './rng'
import { MAX_SKILL, ROLE_LABELS, wageFor, type CourseKind, type Employee, type Role } from './staff'

/**
 * Staff growth: the work each employee does in a day earns experience, and
 * experience raises their skill a step at a time, up to the `potential` each
 * hire comes with. A level-up comes with a request for the new level's wage,
 * which the player grants or declines (unanswered, it lapses).
 *
 * Worked out once a day, in `settleDay`, from the day's `WorkTally`s.
 *
 * The player invests in them too: a training course is a day away for
 * experience (the advanced one, once each, also raises their potential),
 * and someone seasoned can be promoted to their role's Senior title, which
 * mentors the rest of the role and brings a small perk (`SENIOR_PERKS`).
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
  /** Shoppers who walked out on a salesperson's offer (no experience, but it hurts morale). */
  lost: number
  /** Jobs of a mechanic's that came back for a redo (likewise). */
  comebacks: number
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
    lost: 0,
    comebacks: 0,
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
  lost: 0,
  comebacks: 0,
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

/** Whether `e`'s raise request goes unanswered too long at the end of `day`. */
export function askLapses(e: Pick<Employee, 'raiseAsk'>, day: number): boolean {
  return !!e.raiseAsk && day - e.raiseAsk.day >= RAISE_ASK_DAYS
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

/** A course someone finished today, for the summary. */
export interface CourseDone {
  id: string
  name: string
  course: CourseKind
}

/**
 * The roster at the end of `day`, from the day's `work`: raise requests left
 * unanswered `RAISE_ASK_DAYS` lapse, everyone still on the payroll gains the
 * day's experience (× `MENTOR_XP` with a senior of their role in today), those
 * back from a course gain `TRAINING_XP` (and potential, from the advanced one),
 * and each who levels up asks for the new level's wage (unless they're
 * already paid that). The same roster when nothing changed.
 */
export function growStaff(
  roster: Employee[],
  work: StaffWork,
  day: number,
  scale = 1,
): { roster: Employee[]; levelUps: LevelUp[]; lapsed: string[]; courses: CourseDone[] } {
  const levelUps: LevelUp[] = []
  const lapsed: string[] = []
  const courses: CourseDone[] = []
  const mentored = new Set(
    roster.filter((e) => e.senior && !e.fired && work[e.id]?.came).map((e) => e.role),
  )
  let changed = false
  const next = roster.map((e) => {
    if (e.fired) return e
    let n = e
    if (askLapses(n, day)) {
      lapsed.push(n.name)
      n = { ...n, raiseAsk: null }
    }
    // Happier staff learn a little quicker (see `moraleXp`), and a senior shows them how.
    const mentor = mentored.has(e.role) && !e.senior ? MENTOR_XP : 1
    let xp = xpFor(work[e.id]) * moraleXp(e.morale) * mentor
    const course = n.training && n.training.day <= day ? n.training : null
    if (course) {
      n = { ...n, training: null }
      // A booking for a day gone by (it can't be taken now) just lapses.
      if (course.day === day) {
        n = takeCourse(n, course.course)
        xp += TRAINING_XP
        courses.push({ id: e.id, name: e.name, course: course.course })
      }
    }
    n = withLevelUp(grow(n, xp, scale), e.skill, day, levelUps)
    if (n !== e) changed = true
    return n
  })
  return { roster: changed ? next : roster, levelUps, lapsed, courses }
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

/** Experience a course is worth: about two weeks of steady work. */
export const TRAINING_XP = 140

/** A basic course's fee, per role (the advanced one costs `ADVANCED_FEE` × this). */
export const TRAINING_FEES: Record<Role, number> = {
  sales: 400,
  receptionist: 250,
  finance: 500,
  porter: 200,
  security: 300,
  mechanic: 450,
  advisor: 350,
}
/** × the basic fee for the advanced course. */
export const ADVANCED_FEE = 2.5

export const COURSE_LABELS: Record<CourseKind, string> = {
  basic: 'Course',
  advanced: 'Advanced course',
}

/** What sending someone in `role` on `course` costs, paid the morning they go. */
export function trainingFee(role: Role, course: CourseKind): number {
  const fee = TRAINING_FEES[role]
  return course === 'advanced' ? Math.round(fee * ADVANCED_FEE) : fee
}

/**
 * Why `e` can't be booked on `course`: let go or leaving, a course already
 * booked, the advanced course taken or nothing it could raise, or (for the
 * basic one) nothing left to learn below their potential. Null if they can.
 */
export function trainingBlocker(
  e: Pick<Employee, 'fired' | 'quitting' | 'training' | 'trained' | 'skill' | 'xp' | 'potential'>,
  course: CourseKind,
): string | null {
  if (e.fired) return 'They’ve been let go.'
  if (e.quitting) return 'They’re on their way out.'
  if (e.training) return 'They’re already booked on a course.'
  if (course === 'advanced') {
    if (e.trained) return 'They’ve taken the advanced course.'
    if (e.potential >= MAX_SKILL) return 'They can already grow to the top skill.'
    return null
  }
  if (e.skill >= MAX_SKILL) return 'They’re at the top skill.'
  if (e.skill >= ceilingOf(e) && e.xp >= xpToLevel(e.skill)) {
    return 'Nothing left to learn below their potential. Try the advanced course.'
  }
  return null
}

/** `e` back from `course`: the advanced one raises their potential a step (once). */
export function takeCourse(e: Employee, course: CourseKind): Employee {
  if (course !== 'advanced') return e
  return { ...e, potential: Math.min(MAX_SKILL, e.potential + 1), trained: true }
}

/** Days on the payroll before someone can be promoted to Senior. */
export const SENIOR_DAYS = 28
/** The least morale a promotion asks for. */
export const SENIOR_MORALE = 50
/** × their wage for the title. */
export const SENIOR_RAISE = 1.15
/** × the experience of others in a senior's role, on a day the senior's in. */
export const MENTOR_XP = 1.25
/** × the odds Nazma picks a senior to poach. */
export const SENIOR_POACH = 0.5

/** The title a senior in each role holds. */
export const SENIOR_TITLES: Record<Role, string> = {
  sales: 'Senior Salesperson',
  receptionist: 'Head Receptionist',
  finance: 'Finance Director',
  porter: 'Head Porter',
  security: 'Head of Security',
  mechanic: 'Lead Mechanic',
  advisor: 'Senior Service Advisor',
}

/** The small perk each role's senior brings, read through the helpers below. */
export const SENIOR_PERKS: Record<Role, { value: number; text: string }> = {
  sales: { value: 0.02, text: 'Customers a little likelier to say yes to them (+2%)' },
  receptionist: { value: 0.05, text: 'Books more of the calls they make (+5%)' },
  finance: { value: 50, text: '+$50 on their fee per deal' },
  porter: { value: 0.75, text: 'Washes cars a quarter faster' },
  security: { value: 2, text: 'Spots Nazma 2 tiles further off' },
  mechanic: { value: 0.7, text: 'Fewer comebacks (×0.7)' },
  advisor: { value: 0.03, text: 'Sells a little more extra work (+3%)' },
}

/** The role's title for `e`: their Senior title once promoted. */
export function titleOf(e: Pick<Employee, 'role' | 'senior'>): string {
  return e.senior ? SENIOR_TITLES[e.role] : ROLE_LABELS[e.role]
}

type Perked = Pick<Employee, 'role' | 'senior'> | null | undefined

/** The perk `e` brings in `role`, or `none` if they're not its senior. */
function perk(e: Perked, role: Role, none: number): number {
  return e?.senior && e.role === role ? SENIOR_PERKS[role].value : none
}

/** Added to the odds of a yes on a senior salesperson's deals. */
export const seniorAcceptBonus = (e: Perked) => perk(e, 'sales', 0)
/** Added to the odds a senior receptionist's call books. */
export const seniorBookBonus = (e: Perked) => perk(e, 'receptionist', 0)
/** Added to a senior finance manager's fee per deal. */
export const seniorFeeBonus = (e: Perked) => perk(e, 'finance', 0)
/** × a senior porter's wash time. */
export const seniorWashScale = (e: Perked) => perk(e, 'porter', 1)
/** Tiles added to a senior guard's sight. */
export const seniorSightBonus = (e: Perked) => perk(e, 'security', 0)
/** × the comeback odds on a senior mechanic's jobs. */
export const seniorComebackScale = (e: Perked) => perk(e, 'mechanic', 1)
/** Added to the odds a senior advisor sells extra work. */
export const seniorUpsellBonus = (e: Perked) => perk(e, 'advisor', 0)

/**
 * Why `e` can't be promoted on `day`: they need the top skill, `SENIOR_DAYS`
 * on the payroll and `SENIOR_MORALE`, and their role can't have a senior
 * already. Null if they can.
 */
export function promoteBlocker(
  e: Employee,
  roster: readonly Employee[],
  day: number,
): string | null {
  if (e.fired) return 'They’ve been let go.'
  if (e.senior) return `They’re already ${SENIOR_TITLES[e.role]}.`
  if (e.quitting) return 'They’re on their way out.'
  if (e.skill < MAX_SKILL) return `Needs skill ${MAX_SKILL}.`
  const left = SENIOR_DAYS - (day - e.hiredDay)
  if (left > 0) return `Needs ${left} more day${left === 1 ? '' : 's'} on the team.`
  if (e.morale < SENIOR_MORALE) return 'Needs to be happier in the job first.'
  const other = roster.find((x) => x.id !== e.id && x.role === e.role && x.senior && !x.fired)
  if (other) return `${other.name} is already ${SENIOR_TITLES[e.role]}.`
  return null
}

/** Whether `e` can be promoted to Senior on `day`. */
export function canPromote(e: Employee, roster: readonly Employee[], day: number): boolean {
  return promoteBlocker(e, roster, day) === null
}

/** The wage a promotion puts someone on `wage` on. */
export function seniorWage(wage: number): number {
  return Math.round(wage * SENIOR_RAISE)
}

/** The morning's word on who's away on a course today, or null. */
export function courseNotice(away: readonly Pick<Employee, 'name'>[]): string | null {
  if (away.length === 0) return null
  const who = away.map((e) => e.name).join(' and ')
  return `${who} ${away.length === 1 ? 'is' : 'are'} away on a training course today.`
}

/** The summary's word on a finished course. */
export function courseLine(c: CourseDone): string {
  return c.course === 'advanced'
    ? `${c.name} finished the advanced course and can grow further.`
    : `${c.name} finished a training course.`
}
