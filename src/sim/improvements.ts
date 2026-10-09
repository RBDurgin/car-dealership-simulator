import { FURNITURE_SCALE, type Prop, type PropModel, type Rect } from './layout'

/**
 * Improvements: one-off purchases that go up overnight in a fixed spot and stay
 * for good. Outdoor ones catch the street's eye: more passers-by, and more of
 * them turning in. Showroom ones put buyers in a spending mood: they hope to
 * knock less off and say yes a little more often. Waiting-room ones keep
 * waiting customers patient for longer. A slot can have tiers; each tier needs
 * the one before, and only the highest tier owned counts (it replaces the
 * last one in the world).
 */

export type ImprovementId =
  | 'big-sign'
  | 'pylon-sign'
  | 'tube-man'
  | 'polished-floor'
  | 'spotlights'
  | 'turntables'
  | 'lounge-tv'
  | 'designer-sofa'
  | 'coffee-bar'

/** The fixed spot an improvement goes in. Tiers of one slot replace each other. */
export type ImprovementSlot =
  'sign' | 'tube-man' | 'floor' | 'lighting' | 'platforms' | 'tv' | 'sofa' | 'coffee-bar'

/** Where an improvement goes, for grouping in the upgrades tab and the help. */
export type ImprovementArea = 'outside' | 'showroom' | 'lounge'

export const AREA_LABELS: Record<ImprovementArea, string> = {
  outside: 'Out front',
  showroom: 'Showroom',
  lounge: 'Waiting area',
}

/** What improvements add up to. */
export interface Effects {
  /** Added to the share of passers-by who turn in (`WALK_IN_CHANCE`). */
  walkInChance: number
  /** Extra passers-by a day. */
  passersBy: number
  /** Share taken off the discount a new customer hopes for (their `expect`). */
  expectCut: number
  /** Added to the chance a customer says yes (`acceptChance`). */
  acceptBonus: number
  /** Share of a waiting customer's patience loss saved. */
  patienceSaved: number
}

export const NO_EFFECTS: Effects = {
  walkInChance: 0,
  passersBy: 0,
  expectCut: 0,
  acceptBonus: 0,
  patienceSaved: 0,
}

/**
 * Caps on the indoor effects, however many are up: customers always hope for
 * some discount, so there is still haggling, and they always lose patience.
 */
export const MAX_EXPECT_CUT = 0.4
export const MAX_ACCEPT_BONUS = 0.06
export const MAX_PATIENCE_SAVED = 0.5

export interface ImprovementInfo {
  label: string
  cost: number
  slot: ImprovementSlot
  area: ImprovementArea
  /** 1 for the first purchase in a slot; a higher tier replaces the one below. */
  tier: number
  /** The tier it upgrades, which has to be bought first. */
  requires?: ImprovementId
  /** The slot's effects with this tier up (not on top of the tier below). */
  effects: Partial<Effects>
  /** What it is, for the upgrades tab. */
  blurb: string
  /** Props it puts up in the world. */
  props?: Prop[]
  /** Fixed props it swaps the model of. */
  swap?: { propIds: string[]; model: PropModel }
}

// Heights (world units) that stacked props sit at: the model's height times its scale.
const TV_CABINET_TOP = 0.31 * FURNITURE_SCALE

export const IMPROVEMENTS: Record<ImprovementId, ImprovementInfo> = {
  'big-sign': {
    label: 'Bigger sign',
    cost: 5_000,
    slot: 'sign',
    area: 'outside',
    tier: 1,
    effects: { walkInChance: 0.05 },
    blurb: 'A wider board up high that passers-by can’t miss.',
  },
  'pylon-sign': {
    label: 'Lit pylon sign',
    cost: 12_000,
    slot: 'sign',
    area: 'outside',
    tier: 2,
    requires: 'big-sign',
    effects: { walkInChance: 0.1, passersBy: 2 },
    blurb: 'Tall and lit up, seen from down the road.',
  },
  'tube-man': {
    label: 'Inflatable tube man',
    cost: 3_000,
    slot: 'tube-man',
    area: 'outside',
    tier: 1,
    effects: { walkInChance: 0.05, passersBy: 4 },
    blurb: 'Flails by the driveway. People come down the street to look.',
  },
  'polished-floor': {
    label: 'Polished floor',
    cost: 8_000,
    slot: 'floor',
    area: 'showroom',
    tier: 1,
    effects: { expectCut: 0.12, acceptBonus: 0.02 },
    blurb: 'Gleaming tiles from wall to wall. It feels like a proper dealership.',
  },
  spotlights: {
    label: 'Showroom spotlights',
    cost: 6_000,
    slot: 'lighting',
    area: 'showroom',
    tier: 1,
    effects: { expectCut: 0.12, acceptBonus: 0.02 },
    blurb: 'A spotlight on every display car, so the paint shines.',
  },
  turntables: {
    label: 'Turntable platforms',
    cost: 10_000,
    slot: 'platforms',
    area: 'showroom',
    tier: 1,
    effects: { expectCut: 0.12, acceptBonus: 0.02 },
    blurb: 'Lit platforms that turn the display cars slowly to show them off.',
  },
  'lounge-tv': {
    label: 'Waiting room TV',
    cost: 2_500,
    slot: 'tv',
    area: 'lounge',
    tier: 1,
    effects: { patienceSaved: 0.15 },
    blurb: 'Something to watch while they wait.',
    props: [
      {
        id: 'lounge-tv-cabinet',
        model: 'cabinetTelevision',
        rect: { tx: 31, tz: 9, w: 2, h: 1 },
        facing: 0,
      },
      {
        id: 'lounge-tv',
        model: 'televisionModern',
        rect: { tx: 31, tz: 9, w: 2, h: 1 },
        facing: 0,
        blocks: false,
        elevation: TV_CABINET_TOP,
      },
    ],
  },
  'designer-sofa': {
    label: 'Designer sofa',
    cost: 1_500,
    slot: 'sofa',
    area: 'lounge',
    tier: 1,
    effects: { patienceSaved: 0.1 },
    blurb: 'A comfier sofa in place of the old one, and in the wing once it’s built.',
    swap: { propIds: ['lounge-sofa', 'wing-sofa'], model: 'loungeDesignSofa' },
  },
  'coffee-bar': {
    label: 'Coffee bar',
    cost: 3_500,
    slot: 'coffee-bar',
    area: 'lounge',
    tier: 1,
    effects: { patienceSaved: 0.15 },
    blurb: 'A bar with stools beside the coffee machine.',
    props: [
      { id: 'coffee-bar-1', model: 'kitchenBar', rect: { tx: 35, tz: 10, w: 1, h: 1 }, facing: 3 },
      { id: 'coffee-bar-2', model: 'kitchenBar', rect: { tx: 35, tz: 11, w: 1, h: 1 }, facing: 3 },
      {
        id: 'coffee-stool-1',
        model: 'stoolBar',
        rect: { tx: 34, tz: 10, w: 1, h: 1 },
        facing: 1,
        blocks: false,
      },
      {
        id: 'coffee-stool-2',
        model: 'stoolBar',
        rect: { tx: 34, tz: 11, w: 1, h: 1 },
        facing: 1,
        blocks: false,
      },
    ],
  },
}

export const IMPROVEMENT_IDS = Object.keys(IMPROVEMENTS) as ImprovementId[]

/** Ground an improvement drawn by its own component takes up (the sign reuses its post). */
export const IMPROVEMENT_FOOTPRINTS: Partial<Record<ImprovementSlot, Rect>> = {
  // On the lot side of the fence, west of the driveway, beside the end parking space.
  'tube-man': { tx: 16, tz: 23, w: 1, h: 1 },
}

/** Improvements in `ids` that count: the top tier in each slot. */
export function topTiers(ids: readonly ImprovementId[]): ImprovementId[] {
  return ids.filter((id) => IMPROVEMENTS[id].tier === slotTier(ids, IMPROVEMENTS[id].slot))
}

/** Props the improvements `ids` put up. */
export function improvementProps(ids: readonly ImprovementId[]): Prop[] {
  return topTiers(ids).flatMap((id) => IMPROVEMENTS[id].props ?? [])
}

/** The model the fixed prop `propId` is drawn with once `ids` are up, if one swaps it. */
export function swappedModel(ids: readonly ImprovementId[], propId: string): PropModel | null {
  const id = topTiers(ids).find((x) => IMPROVEMENTS[x].swap?.propIds.includes(propId))
  return id ? IMPROVEMENTS[id].swap!.model : null
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
  for (const id of topTiers(ids)) {
    const { effects } = IMPROVEMENTS[id]
    for (const key of Object.keys(total) as (keyof Effects)[]) total[key] += effects[key] ?? 0
  }
  total.expectCut = Math.min(MAX_EXPECT_CUT, total.expectCut)
  total.acceptBonus = Math.min(MAX_ACCEPT_BONUS, total.acceptBonus)
  total.patienceSaved = Math.min(MAX_PATIENCE_SAVED, total.patienceSaved)
  return total
}

/** Footprints of the improvements `ids` that block ground: their own, and their blocking props'. */
export function improvementFootprints(ids: readonly ImprovementId[]): Rect[] {
  const slots = new Set(ids.map((id) => IMPROVEMENTS[id].slot))
  return [
    ...[...slots].flatMap((slot) => IMPROVEMENT_FOOTPRINTS[slot] ?? []),
    ...improvementProps(ids)
      .filter((p) => p.blocks !== false)
      .map((p) => p.rect),
  ]
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
