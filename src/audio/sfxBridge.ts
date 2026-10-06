import type { Vec2 } from '../sim/grid'
import { allowCue, sfxFor, spatialMix, type SfxCue, type SfxSubject } from '../sim/sfxEvents'
import {
  ambientPos,
  cameraState,
  customerPos,
  playerPos,
  rectBounds,
  staffPos,
} from '../scene/runtime'
import { useGame } from '../state/store'
import { playSfx } from './samples'

/** Each cue's level before distance, so the files sit together in the mix. */
const VOLUME: Record<SfxCue, number> = {
  click: 0.5,
  sale: 0.8,
  coin: 0.9,
  chime: 0.6,
  pop: 0.45,
  paper: 0.9,
  bell: 0.6,
  stamp: 0.7,
  spray: 0.35,
  thud: 0.5,
  open: 0.35,
  close: 0.35,
  scuff: 0.6,
  shoo: 0.6,
}

/** When each cue last played, so bursts are heard once (`allowCue`). */
const last = new Map<SfxCue, number>()

/** A sound with no place in the world (a HUD button), through the same gaps as the rest. */
export function playUiCue(cue: SfxCue): void {
  if (allowCue(last, cue, performance.now())) play(cue)
}

function positionOf(subject: SfxSubject): Vec2 | undefined {
  switch (subject.kind) {
    case 'customer':
      return customerPos.get(subject.id)
    case 'employee':
      return staffPos.get(subject.id)
    case 'ambient':
      return ambientPos.get(subject.id)
    case 'car': {
      const car = useGame.getState().inventory.find((c) => c.id === subject.id)
      return car && rectBounds(car.rect)
    }
  }
}

function play(cue: SfxCue, subject?: SfxSubject): void {
  const at = subject && positionOf(subject)
  if (!at) return playSfx(cue, VOLUME[cue])
  const { gain, pan } = spatialMix(playerPos, cameraState.yaw, at)
  playSfx(cue, VOLUME[cue] * gain, pan)
}

/**
 * Plays the sound effects for each store change (`sim/sfxEvents`): sales,
 * arrivals, purchases, notices, panels and the like. Cues tied to someone or
 * something on the lot are placed by where it is relative to the camera.
 */
export function startSfx(): () => void {
  return useGame.subscribe((s, prev) => {
    const events = sfxFor(prev, s)
    if (events.length === 0) return
    const now = performance.now()
    for (const { cue, subject } of events) {
      if (!allowCue(last, cue, now)) continue
      // A customer who just turned up is placed in the world on the next frame.
      if (subject) requestAnimationFrame(() => play(cue, subject))
      else play(cue)
    }
  })
}
