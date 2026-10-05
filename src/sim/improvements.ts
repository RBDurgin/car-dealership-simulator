import type { Rect } from './layout'

/**
 * Improvements: one-off purchases that go up overnight in a fixed spot and stay
 * for good. Outdoor ones catch the street's eye: more passers-by, and more of
 * them turning in. A slot can have tiers; each tier needs the one before, and
 * only the highest tier owned counts (it replaces the last one in the world).
 */

export type ImprovementId = 'big-sign' | 'pylon-sign' | 'tube-man'

/** The fixed spot an improvement goes in. Tiers of one slot replace each other. */
export type ImprovementSlot = 'sign' | 'tube-man'

/** What improvements add up to. */
export interface Effects {
  /** Added to the share of passers-by who turn in (`WALK_IN_CHANCE`). */
  walkInChance: number
  /** Extra passers-by a day. */
  passersBy: number
}

export const NO_EFFECTS: Effects = { walkInChance: 0, passersBy: 0 }

export interface ImprovementInfo {
  label: string
  cost: number
  slot: ImprovementSlot
  /** 1 for the first purchase in a slot; a higher tier replaces the one below. */
  tier: number
  /** The tier it upgrades, which has to be bought first. */
  requires?: ImprovementId
  /** The slot's effects with this tier up (not on top of the tier below). */
  effects: Partial<Effects>
  /** What it is, for the upgrades tab. */
  blurb: string
}

export const IMPROVEMENTS: Record<ImprovementId, ImprovementInfo> = {
  'big-sign': {
    label: 'Bigger sign',
    cost: 5_000,
    slot: 'sign',
    tier: 1,
    effects: { walkInChance: 0.05 },
    blurb: 'A wider board up high that passers-by can’t miss.',
  },
  'pylon-sign': {
    label: 'Lit pylon sign',
    cost: 12_000,
    slot: 'sign',
    tier: 2,
    requires: 'big-sign',
    effects: { walkInChance: 0.1, passersBy: 2 },
    blurb: 'Tall and lit up, seen from down the road.',
  },
  'tube-man': {
    label: 'Inflatable tube man',
    cost: 3_000,
    slot: 'tube-man',
    tier: 1,
    effects: { walkInChance: 0.05, passersBy: 4 },
    blurb: 'Flails by the driveway. People come down the street to look.',
  },
}

export const IMPROVEMENT_IDS = Object.keys(IMPROVEMENTS) as ImprovementId[]

/** Ground an improvement takes up out on the lot, if it needs its own (the sign reuses its post). */
export const IMPROVEMENT_FOOTPRINTS: Partial<Record<ImprovementSlot, Rect>> = {
  // On the lot side of the fence, west of the driveway, beside the end parking space.
  'tube-man': { tx: 16, tz: 23, w: 1, h: 1 },
}

/** An improvement bought on `day`. It goes up overnight. */
export interface OwnedImprovement {
  id: ImprovementId
  day: number
}

/** Improvements up on `day`: everything bought before it. */
export function installed(owned: readonly OwnedImprovement[], day: number): ImprovementId[] {
  return owned.filter((o) => o.day < day).map((o) => o.id)
}

/** The highest tier up in `slot` (0 when there's nothing there yet). */
export function slotTier(ids: readonly ImprovementId[], slot: ImprovementSlot): number {
  return ids.reduce(
    (top, id) => (IMPROVEMENTS[id].slot === slot ? Math.max(top, IMPROVEMENTS[id].tier) : top),
    0,
  )
}

/** The summed effects of improvements `ids`, counting only the top tier in each slot. */
export function effectsOf(ids: readonly ImprovementId[]): Effects {
  const total = { ...NO_EFFECTS }
  for (const id of ids) {
    const { slot, tier, effects } = IMPROVEMENTS[id]
    if (tier !== slotTier(ids, slot)) continue
    total.walkInChance += effects.walkInChance ?? 0
    total.passersBy += effects.passersBy ?? 0
  }
  return total
}

/** Footprints of the improvements `ids` that block ground. */
export function improvementFootprints(ids: readonly ImprovementId[]): Rect[] {
  const slots = new Set(ids.map((id) => IMPROVEMENTS[id].slot))
  return [...slots].flatMap((slot) => IMPROVEMENT_FOOTPRINTS[slot] ?? [])
}

/** Why `id` can't be bought, or null if it can. */
export function improvementBlocker(
  book: { cash: number; improvements: readonly OwnedImprovement[] },
  id: ImprovementId,
): string | null {
  const info = IMPROVEMENTS[id]
  const owns = (x: ImprovementId) => book.improvements.some((o) => o.id === x)
  if (owns(id)) return 'Already bought.'
  if (info.requires && !owns(info.requires)) {
    return `Needs the ${IMPROVEMENTS[info.requires].label.toLowerCase()} first.`
  }
  if (book.cash < info.cost) return 'Not enough cash for that.'
  return null
}

export type BuyResult =
  { ok: true; cash: number; improvements: OwnedImprovement[] } | { ok: false; reason: string }

/** Buys improvement `id` on `day`, paid from cash, to go up overnight. */
export function buyImprovement(
  book: { cash: number; improvements: readonly OwnedImprovement[] },
  id: ImprovementId,
  day: number,
): BuyResult {
  const reason = improvementBlocker(book, id)
  if (reason) return { ok: false, reason }
  return {
    ok: true,
    cash: book.cash - IMPROVEMENTS[id].cost,
    improvements: [...book.improvements, { id, day }],
  }
}
