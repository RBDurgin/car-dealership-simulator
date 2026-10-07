import { Color } from 'three'
import { useGame } from '../state/store'

/** Today's weather, which changes only at the start of a day. */
export const useWeather = () => useGame((s) => s.weather)

/**
 * Wet ground: outdoor surfaces darken a shade and take a slight sheen. Without
 * an environment map a glossier surface only looks darker, so the sheen stays light.
 */
export function wetLook(color: string, wet: boolean): { color: Color; roughness: number } {
  const c = new Color(color)
  return wet ? { color: c.multiplyScalar(0.9), roughness: 0.85 } : { color: c, roughness: 1 }
}
