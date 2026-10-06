import { dayOver, type GameTime } from './clock'

/**
 * Background music: which looping track plays for the moment the game is in.
 * Pure; `audio/music.ts` streams and crossfades the tracks.
 */
export type TrackId = 'title' | 'morning' | 'afternoon' | 'closing' | 'summary'

export const TRACKS: readonly TrackId[] = ['title', 'morning', 'afternoon', 'closing', 'summary']

/** The morning track gives way to the afternoon's at noon. */
export const NOON_MINUTE = 12 * 60
/** The closing rush: the last hour before the doors shut, and its stragglers after. */
export const RUSH_MINUTE = 17 * 60

/** Seconds one track takes to fade into the next. */
export const CROSSFADE_SECONDS = 3
/** While muffled, music plays this loud and through a low-pass at this cutoff. */
export const MUFFLE_GAIN = 0.5
export const MUFFLE_CUTOFF_HZ = 700
/** The low-pass sits here when open, above anything audible. */
export const OPEN_CUTOFF_HZ = 20_000

/** The slice of the store the music follows. */
export interface MusicState {
  screen: 'title' | 'playing'
  clock: GameTime
  customers: readonly unknown[]
  helpOpen: boolean
  rotatePrompt: boolean
}

/**
 * The track for this moment: the title's on the title screen, the summary's
 * once the day is done, and otherwise the day part's from the clock. The
 * closing rush carries on past closing while the last customers leave.
 */
export function trackFor(s: MusicState): TrackId {
  if (s.screen === 'title') return 'title'
  if (dayOver(s)) return 'summary'
  if (s.clock.minute < NOON_MINUTE) return 'morning'
  if (s.clock.minute < RUSH_MINUTE) return 'afternoon'
  return 'closing'
}

/**
 * The music sounds muffled, as if from the next room, while something covers
 * the whole game: the how-to-play guide or the rotate-your-device prompt.
 */
export function isMuffled(s: Pick<MusicState, 'helpOpen' | 'rotatePrompt'>): boolean {
  return s.helpOpen || s.rotatePrompt
}
