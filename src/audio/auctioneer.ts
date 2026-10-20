import { auctioneerSpeaks } from '../sim/bidding'
import { utterance, utteranceMs, voiceOf } from '../sim/gibberish'
import { createRng } from '../sim/rng'
import { isPaused } from '../state/store'
import { subscribeTo } from '../state/subscribe'
import { speak } from './voice'

/** The auctioneer always sounds the same. */
const VOICE = voiceOf('auctioneer', 'male')
/** Syllables in one burst of the chant. */
const CHANT = { min: 6, max: 10 }
/** Level of the chant before the voice bus: he's on the other end of a computer. */
const GAIN = 0.55

/**
 * The auctioneer's chant while the Auction tab is open on a live lot: a fast
 * burst of gibberish on each raise and call (`auctioneerSpeaks`), never over
 * his own last line. Centred, as he's on the screen, not on the lot.
 */
export function startAuctioneer(): () => void {
  const rng = createRng(Date.now())
  let busyUntil = 0
  return subscribeTo(
    (s) => s.auction,
    (next, prev, s) => {
      if (!s.stockOpen || s.computerTab !== 'auction' || isPaused(s)) return
      if (!auctioneerSpeaks(prev, next)) return
      const now = performance.now()
      if (now < busyUntil) return
      const line = utterance(rng, VOICE, 'auctioneer', rng.int(CHANT.min, CHANT.max))
      if (speak(VOICE, line, GAIN, 0)) busyUntil = now + utteranceMs(line)
    },
  )
}
