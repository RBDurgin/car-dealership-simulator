import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { QUALITY_TIERS, stepDown, stepUp, type Quality as Steps } from '../sim/graphics'
import { sceneIdle, useGame } from '../state/store'

/**
 * Frame rates (fps) under which a few seconds' running steps the quality
 * down, and over which it steps back up. Fixed, not drei's default: that
 * guesses the display's refresh rate from the best fps seen, so a desktop
 * stuck at 30 would never step down.
 */
const BOUNDS: [number, number] = [45, 57]
/** drei samples the frame rate over `SAMPLE_MS` and judges the last `SAMPLES` of them. */
const SAMPLE_MS = 500
const SAMPLES = 10

const now = () => performance.now() / 1000

/**
 * The scene's graphics quality: sets the canvas's pixel ratio from the
 * store's `qualityTier` (the shadow map and the rain read it themselves),
 * and on Auto, while the game is being played, steps the tier down after
 * sustained low frame rates and up after high ones (`sim/graphics.ts`).
 */
export function Quality() {
  const playing = useGame((s) => !sceneIdle(s))
  const setDpr = useThree((s) => s.setDpr)
  const tier = useGame((s) => s.qualityTier)
  const graphics = useGame((s) => s.graphics)
  const steps = useRef<Steps | null>(null)

  // A new setting starts its own tier (state/persistence) with Auto's history cleared.
  useEffect(() => {
    steps.current = { tier: useGame.getState().qualityTier, ceiling: 0, since: now() }
  }, [graphics])

  useEffect(() => setDpr([1, QUALITY_TIERS[tier].dpr]), [setDpr, tier])

  if (graphics !== 'auto' || !playing) return null
  const apply = (step: (q: Steps) => Steps) => {
    const q = steps.current
    if (!q) return
    const tier = useGame.getState().qualityTier
    const next = step({ ...q, tier })
    steps.current = next
    if (next.tier !== tier) useGame.getState().setQualityTier(next.tier)
  }
  return (
    <PerformanceMonitor
      bounds={() => BOUNDS}
      ms={SAMPLE_MS}
      iterations={SAMPLES}
      onDecline={() => apply((q) => stepDown(q, 'auto', now()))}
      onIncline={() => apply((q) => stepUp(q, 'auto', now()))}
    />
  )
}
