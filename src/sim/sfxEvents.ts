import { dayOver, type GameTime } from './clock'
import type { Customer } from './customers'
import { eventOn } from './events'
import type { Vec2 } from './grid'
import type { InventoryCar } from './inventory'
import { NAZMA_ID, type NazmaVisit } from './nazma'
import type { Employee } from './staff'

/** What a sound effect is for. `audio/samples.ts` maps each to a file (or a synth). */
export type SfxCue =
  | 'click'
  | 'sale'
  | 'coin'
  | 'chime'
  | 'pop'
  | 'paper'
  | 'bell'
  | 'stamp'
  | 'spray'
  | 'thud'
  | 'open'
  | 'close'
  | 'scuff'
  | 'shoo'
  | 'fanfare'
  | 'engine'
  | 'door'

/**
 * Where a cue happens: a customer, an employee, a car in stock, a visitor's
 * car (by its customer's id, with the space it parks in) or someone the store
 * doesn't place (Nazma). UI cues have none.
 */
export type SfxSubject =
  | { kind: 'customer'; id: string }
  | { kind: 'employee'; id: string }
  | { kind: 'car'; id: string }
  | { kind: 'vehicle'; id: string; spot: number }
  | { kind: 'ambient'; id: string }

export interface SfxEvent {
  cue: SfxCue
  subject?: SfxSubject
}

/** The slice of the store `sfxFor` compares. */
export interface SfxState {
  screen: 'title' | 'playing'
  clock: GameTime
  customers: readonly Customer[]
  inventory: readonly InventoryCar[]
  roster: readonly Employee[]
  orders: readonly unknown[]
  campaigns: readonly unknown[]
  improvements: readonly unknown[]
  nazma: NazmaVisit | null
  notice: { id: number } | null
  staffOpen: boolean
  stockOpen: boolean
  helpOpen: boolean
  audioOpen: boolean
  inspectedId: string | null
}

/**
 * Real-time milliseconds a cue waits before it can play again, so a burst of
 * events (dev speed, a crowd turning up at once) is heard once.
 */
export const SFX_MIN_GAP_MS: Record<SfxCue, number> = {
  click: 40,
  sale: 1500,
  coin: 150,
  chime: 1200,
  pop: 400,
  paper: 1000,
  bell: 2000,
  stamp: 300,
  spray: 1500,
  thud: 800,
  open: 80,
  close: 80,
  scuff: 500,
  shoo: 1000,
  fanfare: 2000,
  engine: 800,
  door: 300,
}

const PANELS = ['staffOpen', 'stockOpen', 'helpOpen', 'audioOpen'] as const

/**
 * The sound effects for one store change, from `prev` to `next`. Pure: the
 * caller plays them. Starting or resuming a game from the title is only the
 * morning bell, so a loaded save doesn't replay its hires and purchases.
 */
export function sfxFor(prev: SfxState, next: SfxState): SfxEvent[] {
  if (next.screen !== 'playing') return []
  if (prev.screen !== 'playing') return [{ cue: 'bell' }]
  const out: SfxEvent[] = []

  // A sale weekend opens each of its days with a fanfare instead of the bell.
  if (next.clock.day > prev.clock.day) {
    out.push({ cue: eventOn(next.clock.day) ? 'fanfare' : 'bell' })
  }
  if (dayOver(next) && !dayOver(prev)) out.push({ cue: 'paper' })

  if (next.customers !== prev.customers) {
    const before = new Map(prev.customers.map((c) => [c.id, c]))
    const after = new Set(next.customers.map((c) => c.id))
    const car = (c: Customer, spot: number): SfxSubject => ({ kind: 'vehicle', id: c.id, spot })
    for (const c of next.customers) {
      const was = before.get(c.id)
      const subject: SfxSubject = { kind: 'customer', id: c.id }
      if (!was) {
        out.push({ cue: 'chime', subject })
        // A driver is heard coming up the road.
        if (c.vehicle) out.push({ cue: 'engine', subject: car(c, c.vehicle.spot) })
        continue
      }
      if (c.vehicle?.parked && !was.vehicle?.parked) {
        out.push({ cue: 'door', subject: car(c, c.vehicle.spot) })
      }
      if (c.phase !== 'leaving' || was.phase === 'leaving') continue
      if (c.leaveReason === 'bought') out.push({ cue: 'sale', subject })
      else if (c.leaveReason === 'refused' || c.leaveReason === 'impatient') {
        out.push({ cue: 'thud', subject })
      }
    }
    // A driver got back in and is pulling away.
    for (const c of prev.customers) {
      if (after.has(c.id) || !c.vehicle || c.phase !== 'leaving') continue
      if (c.vehicle.parked) out.push({ cue: 'door', subject: car(c, c.vehicle.spot) })
      out.push({ cue: 'engine', subject: car(c, c.vehicle.spot) })
    }
  }

  if (next.inventory !== prev.inventory) {
    const before = new Map(prev.inventory.map((c) => [c.id, c.cleanliness]))
    for (const car of next.inventory) {
      const was = before.get(car.id)
      if (was !== undefined && car.cleanliness > was) {
        out.push({ cue: 'spray', subject: { kind: 'car', id: car.id } })
      }
    }
  }

  if (next.nazma && prev.nazma && next.nazma !== prev.nazma) {
    if (next.nazma.progress > prev.nazma.progress) {
      const id = next.nazma.targets[next.nazma.progress - 1]
      // Only a car he actually dirtied: a sold one he gives up on.
      const car = next.inventory.find((c) => c.id === id)
      const was = prev.inventory.find((c) => c.id === id)
      if (car && was && car.cleanliness < was.cleanliness) {
        out.push({ cue: 'scuff', subject: { kind: 'car', id } })
      }
    }
    if (next.nazma.status === 'runOff' && prev.nazma.status !== 'runOff') {
      out.push({ cue: 'shoo', subject: { kind: 'ambient', id: NAZMA_ID } })
    }
  }

  if (next.roster !== prev.roster) {
    const before = new Map(prev.roster.map((e) => [e.id, e]))
    const stamped = next.roster.some((e) => {
      const was = before.get(e.id)
      return !was || (e.fired && !was.fired)
    })
    if (stamped) out.push({ cue: 'stamp' })
  }

  const bought =
    next.orders.length > prev.orders.length ||
    next.campaigns.length > prev.campaigns.length ||
    next.improvements.length > prev.improvements.length
  if (bought) out.push({ cue: 'coin' })

  if (next.notice && next.notice.id !== prev.notice?.id) out.push({ cue: 'pop' })

  const panelOpen = (s: SfxState) => PANELS.filter((p) => s[p]).length + (s.inspectedId ? 1 : 0)
  const opened = PANELS.some((p) => next[p] && !prev[p]) || (next.inspectedId && !prev.inspectedId)
  if (opened) out.push({ cue: 'open' })
  else if (panelOpen(next) < panelOpen(prev)) out.push({ cue: 'close' })

  return out
}

/**
 * A notice that comes with its own sound (a sale, a hire, a purchase) doesn't
 * pop as well, if that sound played within this many ms.
 */
export const POP_YIELD_MS = 600
/** A button's click is dropped if a panel opened or closed this many ms before. */
export const CLICK_YIELD_MS = 100
/** Cues a notice pop doesn't yield to: they're too slight to stand in for it. */
const SLIGHT: readonly SfxCue[] = ['pop', 'click', 'open', 'close']

/**
 * Whether `cue` may play at `now` (ms), given when each cue last played, and
 * if so records it. Mutates `last`, which the caller keeps between changes.
 */
export function allowCue(last: Map<SfxCue, number>, cue: SfxCue, now: number): boolean {
  const at = last.get(cue)
  if (at !== undefined && now - at < SFX_MIN_GAP_MS[cue]) return false
  if (cue === 'pop') {
    for (const [other, t] of last) {
      if (!SLIGHT.includes(other) && now - t < POP_YIELD_MS) return false
    }
  }
  // The button that opened or closed a panel is heard as the panel.
  if (cue === 'click') {
    for (const panel of ['open', 'close'] as const) {
      const t = last.get(panel)
      if (t !== undefined && now - t < CLICK_YIELD_MS) return false
    }
  }
  last.set(cue, now)
  return true
}

// Spatial mixing. World units are tiles; the camera follows the player, so
// distance and screen x are measured from them.

/** Full volume within this distance of the listener. */
export const SFX_NEAR = 6
/** At this distance and beyond a cue plays at `SFX_FAR_GAIN`. */
export const SFX_FAR = 30
/** Events across the lot stay audible: a sale out back still deserves a jingle. */
export const SFX_FAR_GAIN = 0.2
/** Screen-x distance (world units) that pans fully to one side. */
const PAN_RANGE = 16
/** Never hard-pan; a sound fully in one ear is jarring. */
const MAX_PAN = 0.7

/**
 * Gain (0–1) and stereo pan (−1 left … 1 right) for a sound at `at`, heard
 * from `listener` with the camera at `yaw` (0 = camera on +z looking toward −z).
 */
export function spatialMix(listener: Vec2, yaw: number, at: Vec2): { gain: number; pan: number } {
  const dx = at.x - listener.x
  const dz = at.z - listener.z
  const dist = Math.hypot(dx, dz)
  const t = Math.min(1, Math.max(0, (dist - SFX_NEAR) / (SFX_FAR - SFX_NEAR)))
  const gain = 1 - t * (1 - SFX_FAR_GAIN)
  // The screen's right in world space.
  const screenX = dx * Math.cos(yaw) - dz * Math.sin(yaw)
  const pan = Math.max(-MAX_PAN, Math.min(MAX_PAN, (screenX / PAN_RANGE) * MAX_PAN))
  return { gain, pan }
}
