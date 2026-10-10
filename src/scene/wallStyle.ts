import { Color } from 'three'
import type { WallMode } from '../sim/walls'

/** How tall the building walls stand in each mode (scene/Walls; the garage's door frames follow). */
export const WALL_HEIGHT: Record<WallMode, number> = { up: 2.4, cutaway: 0.35, down: 0.1 }
export const THICKNESS = { solid: 0.16, glass: 0.08, fence: 0.05 }
/** The strip along a wall's top. */
export const CAP = 0.05
export const WALL_COLOR = '#ece7dd'
export const CAP_COLORS = { solid: new Color('#5b5f66'), glass: new Color('#2f3338') }
