/**
 * Graphics quality (Phase 18e): three tiers of pixel ratio, shadow map and
 * rain, and the player's Graphics setting. On Auto the scene steps down a
 * tier after sustained low frame rates and back up, at most once a minute,
 * after sustained high ones, never to a tier it has fallen from. Kept per
 * device in localStorage, apart from the save game, like the sound settings.
 */

export type GraphicsSetting = 'auto' | 'high' | 'low'

export const GRAPHICS_SETTINGS: readonly GraphicsSetting[] = ['auto', 'high', 'low']

export const DEFAULT_GRAPHICS: GraphicsSetting = 'auto'

export interface QualityTier {
  /** Device pixel ratio the canvas renders at, at most. */
  dpr: number
  /** Width and height of the sun's shadow map. */
  shadowMap: number
  /** Raindrops in the air on a rainy day. */
  rain: number
}

/** Best first. */
export const QUALITY_TIERS: readonly QualityTier[] = [
  { dpr: 2, shadowMap: 4096, rain: 1400 },
  { dpr: 1.5, shadowMap: 2048, rain: 900 },
  { dpr: 1, shadowMap: 1024, rain: 450 },
]

export const LOWEST_TIER = QUALITY_TIERS.length - 1

/** Seconds after any step before Auto steps up. */
export const STEP_UP_SECONDS = 60
/** Seconds after any step before Auto steps down again: the frame rate is measured anew first. */
export const SETTLE_SECONDS = 6

/** Where Auto is, and how far up it may still go. */
export interface Quality {
  tier: number
  /** The best tier Auto may climb back to: below any it has fallen from. */
  ceiling: number
  /** When it last stepped (or started), in seconds. */
  since: number
}

/**
 * The tier to start on: High and Low hold the best and the lowest; Auto starts
 * a step down on phones and small screens (`compact`), at the top otherwise.
 */
export function startQuality(setting: GraphicsSetting, compact: boolean, now = 0): Quality {
  const tier = setting === 'high' ? 0 : setting === 'low' ? LOWEST_TIER : compact ? 1 : 0
  return { tier, ceiling: 0, since: now }
}

/**
 * A step down after sustained low frame rates, unless already at the lowest
 * or within `SETTLE_SECONDS` of the last step. Auto only.
 */
export function stepDown(q: Quality, setting: GraphicsSetting, now: number): Quality {
  if (setting !== 'auto' || q.tier >= LOWEST_TIER) return q
  if (now - q.since < SETTLE_SECONDS) return q
  return { tier: q.tier + 1, ceiling: Math.max(q.ceiling, q.tier + 1), since: now }
}

/**
 * A step up after sustained high frame rates: at most once every
 * `STEP_UP_SECONDS`, and never above `ceiling`. Auto only.
 */
export function stepUp(q: Quality, setting: GraphicsSetting, now: number): Quality {
  if (setting !== 'auto' || q.tier <= q.ceiling) return q
  if (now - q.since < STEP_UP_SECONDS) return q
  return { ...q, tier: q.tier - 1, since: now }
}

/** A setting from storage, or the default for anything else. */
export function parseGraphics(raw: unknown): GraphicsSetting {
  return GRAPHICS_SETTINGS.includes(raw as GraphicsSetting)
    ? (raw as GraphicsSetting)
    : DEFAULT_GRAPHICS
}
