import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { BEAT_MINUTES } from '../sim/bidding'
import { advance, CLOCK_STEP_MINUTES } from '../sim/clock'
import { isPaused, useGame } from '../state/store'
import { gameTime, nextFrame } from './runtime'

const MAX_FRAME_S = 0.25

/**
 * Runs the game clock. Accumulates real time every frame in `runtime.gameTime` and
 * tells the store only when a new 10-minute step starts. The clock stops by itself
 * at closing, so it stays paused while the end-of-day summary is up, and it
 * doesn't run while the title screen or the guide is up. While the dealer
 * auction is running it's also told each beat of the run (`BEAT_MINUTES`).
 */
export function GameClock() {
  // Dev: T cycles the game speed so a whole day can be checked quickly.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && !e.repeat) useGame.getState().cycleTimeScale()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Before anything else each frame, so the frame's crowd is gathered afresh.
  useFrame(nextFrame, -1)

  useFrame((_, rawDelta) => {
    const game = useGame.getState()
    // Time stands still behind the title screen and the guide.
    if (isPaused(game)) return
    // A new day was started from outside (the day summary): jump to it.
    if (game.clock.day !== gameTime.day) Object.assign(gameTime, game.clock)

    const prevMinute = gameTime.minute
    const prevStep = Math.floor(prevMinute / CLOCK_STEP_MINUTES)
    // Clamped so returning to a backgrounded tab doesn't skip hours. Looser than the
    // movement loops' 0.05s so a low frame rate doesn't slow the day down.
    const next = advance(gameTime, Math.min(rawDelta, MAX_FRAME_S) * 1000 * game.timeScale)
    gameTime.minute = next.minute
    if (Math.floor(next.minute / CLOCK_STEP_MINUTES) !== prevStep) game.tickClock(next)
    const run = useGame.getState().auction
    if (
      run &&
      !run.over &&
      Math.floor(next.minute / BEAT_MINUTES) !== Math.floor(prevMinute / BEAT_MINUTES)
    ) {
      useGame.getState().tickAuction(next.minute)
    }
  })
  return null
}
