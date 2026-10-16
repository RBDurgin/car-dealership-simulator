import { skillSeconds, wageFor, type Employee } from './staff'
import type { WorkTally } from './growth'

/**
 * Staff morale: how each employee feels about the job, 0–100. It moves once a
 * day, in `settleDay`, with their pay, the day's wins and rough patches,
 * coworkers leaving and a raise turned down, and drifts back toward
 * `MORALE_HOME`. The effects are gentle: high morale works a little faster
 * and learns a little quicker, low morale a little slower, draws Nazma's
 * eye and, left long enough under `LOW_MORALE`, ends in notice.
 */

export const MIN_MORALE = 0
export const MAX_MORALE = 100
/** A new hire's morale. */
export const START_MORALE = 70
/** Where morale drifts back to, a share of the gap each day (`DRIFT`). */
export const MORALE_HOME = 65
const DRIFT = 0.1
/** The most a day can move anyone's morale, either way. */
export const MAX_DAILY_MORALE = 8
/** Under this, a day counts toward `lowDays`. */
export const LOW_MORALE = 25
/** At or over this, they're happy (the smiling face). */
export const HAPPY_MORALE = 75
/** Days in a row under `LOW_MORALE` before they warn they're unhappy. */
export const QUIT_WARN_DAYS = 3
/** Days after the warning before they hand in notice. */
export const NOTICE_DAYS = 2
/** What being kept with a raise (see `retentionRaise`) does for their morale. */
export const KEEP_MORALE = 15

/** Morale per day for each 10% they're paid under (or over) the wage for their skill. */
const PAY_STEP = 1.5
/** The most being overpaid lifts morale a day. */
const MAX_OVERPAID = 1
/** A raise turned down, or left to lapse. */
const RAISE_DECLINED = -8
/** Each win today: a sale, a finished job, Nazma run off. */
const WIN = 0.5
/** The most the day's wins add. */
const MAX_WINS = 2
/** Each shopper who walked out on them, or a job that came back. */
const ROUGH = -1
/** The most the day's rough patches take off. */
const MAX_ROUGH = -3
/** Each coworker who left today, let go or quitting. */
const COWORKER_LEFT = -2
/** The most coworkers leaving takes off in a day. */
const MAX_COWORKERS = -4

export type MoraleReasonId = 'pay' | 'raise' | 'wins' | 'rough' | 'coworkers' | 'drift'

export interface MoraleReason {
  id: MoraleReasonId
  /** What it did to their morale, to a tenth. */
  delta: number
}

/** What happened today that bears on one employee's morale. */
export interface MoraleContext {
  /** Their work today (see `sim/growth.ts`). */
  tally: WorkTally | undefined
  /** They turned down (or let lapse) a raise they asked for today. */
  raiseDeclined: boolean
  /** Coworkers who left today, let go or quitting. */
  coworkersLost: number
  /** The level's `moraleShift`, added to the day's change (not shown as a reason). */
  shift?: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * How `e`'s morale moves at the end of a day like `ctx`: the reasons (each
 * rounded to a tenth, zeroes left out) and their sum with the level's shift,
 * capped at `MAX_DAILY_MORALE` either way.
 */
export function moraleChange(
  e: Pick<Employee, 'role' | 'skill' | 'wage' | 'morale'>,
  ctx: MoraleContext,
): { delta: number; reasons: MoraleReason[] } {
  const fair = wageFor(e.role, e.skill)
  const payGap = (e.wage - fair) / fair
  const t = ctx.tally
  const wins = t ? t.sales + t.jobs + t.chases : 0
  const rough = t ? t.lost + t.comebacks : 0
  const raw: MoraleReason[] = [
    { id: 'pay', delta: Math.min(MAX_OVERPAID, payGap * 10 * PAY_STEP) },
    { id: 'raise', delta: ctx.raiseDeclined ? RAISE_DECLINED : 0 },
    { id: 'wins', delta: Math.min(MAX_WINS, wins * WIN) },
    { id: 'rough', delta: Math.max(MAX_ROUGH, rough * ROUGH) },
    { id: 'coworkers', delta: Math.max(MAX_COWORKERS, ctx.coworkersLost * COWORKER_LEFT) },
    { id: 'drift', delta: (MORALE_HOME - e.morale) * DRIFT },
  ]
  const reasons = raw.map((r) => ({ ...r, delta: round1(r.delta) })).filter((r) => r.delta !== 0)
  const sum = reasons.reduce((s, r) => s + r.delta, 0) + (ctx.shift ?? 0)
  return { delta: round1(clamp(sum, -MAX_DAILY_MORALE, MAX_DAILY_MORALE)), reasons }
}

/** `morale` moved by `delta`, kept within 0–100. */
export function withMorale(morale: number, delta: number): number {
  return round1(clamp(morale + delta, MIN_MORALE, MAX_MORALE))
}

/**
 * Work-time scale: ×1 for a content team (50–70, where a new hire starts),
 * down to ×0.95 at 85 and over, and up to ×1.15 at 0.
 */
export function moralePace(morale: number): number {
  const m = clamp(morale, MIN_MORALE, MAX_MORALE)
  if (m < 50) return 1 + 0.15 * ((50 - m) / 50)
  if (m > START_MORALE) return 1 - 0.05 * Math.min(1, (m - START_MORALE) / 15)
  return 1
}

/**
 * Experience scale: ×1 for a content team (50–80), down to ×0.8 at 0 and up
 * to ×1.1 at 100.
 */
export function moraleXp(morale: number): number {
  const m = clamp(morale, MIN_MORALE, MAX_MORALE)
  if (m < 50) return 0.8 + 0.2 * (m / 50)
  if (m > 80) return 1 + 0.1 * ((m - 80) / 20)
  return 1
}

/** Nazma's poach weight: ×1 at home or better, up to ×1.5 at `LOW_MORALE` or under. */
export function moralePoachWeight(morale: number): number {
  if (morale >= MORALE_HOME) return 1
  return 1 + 0.5 * Math.min(1, (MORALE_HOME - morale) / (MORALE_HOME - LOW_MORALE))
}

/**
 * Game seconds `e` takes over a task an average employee does in `base`:
 * their skill (`skillSeconds`) and their morale (`moralePace`).
 */
export function workSeconds(base: number, e: Pick<Employee, 'skill' | 'morale'>): number {
  return skillSeconds(base, e.skill) * moralePace(e.morale)
}

/** Whether they've warned they're unhappy: `QUIT_WARN_DAYS` or more under `LOW_MORALE`. */
export function isWarned(e: Pick<Employee, 'lowDays' | 'fired'>): boolean {
  return !e.fired && e.lowDays >= QUIT_WARN_DAYS
}

/** Whether they hand in notice this morning (only where the level allows it). */
export function resignsToday(e: Pick<Employee, 'lowDays' | 'fired' | 'quitting'>): boolean {
  return !e.fired && !e.quitting && e.lowDays >= QUIT_WARN_DAYS + NOTICE_DAYS
}

/** What each reason means, for the staff panel. */
export function moraleReasonText(r: MoraleReason): string {
  const up = r.delta > 0
  switch (r.id) {
    case 'pay':
      return up ? 'Well paid' : 'Underpaid for their skill'
    case 'raise':
      return 'Raise turned down'
    case 'wins':
      return 'A good day’s work'
    case 'rough':
      return 'Things went wrong'
    case 'coworkers':
      return 'A coworker left'
    case 'drift':
      return up ? 'Perking up' : 'Settling down'
  }
}

/** Each reason with what it did, as "Underpaid for their skill −2.5". */
export function moraleLines(reasons: readonly MoraleReason[]): string[] {
  return reasons.map((r) => `${moraleReasonText(r)} ${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta)}`)
}

/** A face for their mood. */
export function moraleFace(morale: number): string {
  if (morale >= HAPPY_MORALE) return '😄'
  if (morale >= 50) return '🙂'
  if (morale >= LOW_MORALE) return '😐'
  return '😟'
}

/** "Content (64)" and so on. */
export function moraleLabel(morale: number): string {
  const word =
    morale >= HAPPY_MORALE
      ? 'Happy'
      : morale >= 50
        ? 'Content'
        : morale >= LOW_MORALE
          ? 'Fed up'
          : 'Unhappy'
  return `${word} (${Math.round(morale)})`
}

/**
 * The roster with the day's morale applied to everyone still on the payroll
 * (not let go, not already quitting): each one's change and reasons from
 * `ctxFor`, and `lowDays` counted on (only if `countLow`: the level lets
 * people quit over morale) or reset.
 */
export function moraleDay(
  roster: Employee[],
  ctxFor: (e: Employee) => MoraleContext,
  countLow = true,
): Employee[] {
  let changed = false
  const next = roster.map((e) => {
    if (e.fired || e.quitting) return e
    const { delta, reasons } = moraleChange(e, ctxFor(e))
    const morale = withMorale(e.morale, delta)
    const lowDays = countLow && morale < LOW_MORALE ? e.lowDays + 1 : 0
    changed = true
    return { ...e, morale, lowDays, moraleWhy: reasons }
  })
  return changed ? next : roster
}

/** Those on `roster` who warn this morning that they're unhappy (just reached `QUIT_WARN_DAYS`). */
export function newlyWarned(roster: readonly Employee[]): Employee[] {
  return roster.filter((e) => !e.fired && !e.quitting && e.lowDays === QUIT_WARN_DAYS)
}

/** The morning's word on those who've warned they're unhappy, or handed in notice. */
export function moraleNotice(warned: readonly string[], resigned: readonly string[]) {
  const parts: string[] = []
  if (warned.length > 0) {
    const who = warned.join(' and ')
    parts.push(
      `${who} ${warned.length === 1 ? 'is' : 'are'} unhappy and thinking of leaving. Check their pay in the Staff panel.`,
    )
  }
  if (resigned.length > 0) {
    parts.push(
      `${resigned.join(' and ')} handed in notice and leave${resigned.length === 1 ? 's' : ''} at closing unless you keep them.`,
    )
  }
  return parts.length > 0 ? parts.join(' ') : null
}
