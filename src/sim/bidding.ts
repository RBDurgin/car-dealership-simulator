import { lotValue, type Lot } from './auction'
import { formatTime } from './clock'
import { PLAYER_ID } from './customers'
import type { Rng } from './rng'

/**
 * Live bidding at the dealer auction: one lot on the block at a time, the
 * price climbing as the dealers bid, and the auctioneer's call going once,
 * twice, sold while nobody raises. Pure: the store keeps the state (never
 * saved) and steps it with the clock, so a paused game stops the run too.
 */

/** The run starts at 10:00 on auction day and is closed at 1:30 whatever's left. */
export const AUCTION_START = 10 * 60
export const AUCTION_END = 13 * 60 + 30
/** Game minutes per beat of the run: a raise, or a quiet beat toward the call. */
export const BEAT_MINUTES = 0.5
/** Quiet beats before the call moves on (open → once → twice → sold). */
export const CALL_BEATS = 4
/** Each beat, the chance that a dealer still in raises. Under 1, so the price doesn't race. */
export const BID_CHANCE = 0.75
/** A lot opens at this share of its wholesale value. */
export const OPEN_FACTOR = 0.75
/** How many dealers bid on a lot. */
export const BIDDERS = { min: 3, max: 5 }
/** Each dealer's top bid is this range of the wholesale value (before `heat`). */
export const BIDDER_TOP = { low: 0.85, high: 1.08 }

/** The trade's other dealers at the auction. */
export const DEALER_NAMES = [
  'Ridgeway Motors',
  'Lakeside Auto',
  'Pine Hill Cars',
  'Summit Auto Sales',
  'Riverbend Motors',
  'Oak Street Auto',
  'Harbor Car Co.',
  'Valley Auto Group',
] as const

/** Where the auctioneer has got to on the lot on the block. */
export type Call = 'open' | 'once' | 'twice' | 'sold'

/** A dealer bidding on the lot on the block, with the most they'll pay. */
export interface Bidder {
  id: string
  name: string
  max: number
}

/** How a lot went: who bought it (`PLAYER_ID`, a dealer's name, or null when nobody bid) and for what. */
export interface LotResult {
  lotId: string
  price: number
  buyer: string | null
  /** The player won it but couldn't pay for or place it any more. */
  fell?: true
  /** Won on the used-car manager's bid (the player's max bid). */
  proxy?: true
}

/** The run on auction day. */
export interface AuctionState {
  /** The last beat stepped, in game minutes. */
  minute: number
  /** The lot on the block, by its place in the run; the run's length once it's over. */
  lotIndex: number
  /** The high bid, or the asking price while nobody has bid. */
  price: number
  /** Who holds the high bid: `PLAYER_ID`, a bidder's id, or null. */
  high: string | null
  /** The dealership's high bid was the used-car manager's, not the player's. */
  proxy: boolean
  call: Call
  /** Beats since the last raise or call. */
  quiet: number
  bidders: Bidder[]
  /** The lots run so far, in order. */
  results: LotResult[]
  /** True once every lot has run, or the window has closed. */
  over: boolean
}

/** The auction's bid increment at `price`: $100 under $5k, $250 under $15k, then $500. */
export function bidStep(price: number): number {
  if (price < 5_000) return 100
  if (price < 15_000) return 250
  return 500
}

/** What a lot opens at on `day`: `OPEN_FACTOR` of its wholesale value, down to the increment. */
export function openingBid(lot: Lot, day: number): number {
  const ask = lotValue(lot, day) * OPEN_FACTOR
  const step = bidStep(ask)
  return Math.max(step, Math.floor(ask / step) * step)
}

/**
 * The dealers bidding on `lot`: three to five, each with a top bid spread
 * around its wholesale value (`BIDDER_TOP`) and scaled by `heat`.
 */
export function bidderMaxes(lot: Lot, day: number, rng: Rng, heat = 1): Bidder[] {
  // The trade bids on the sheet: nobody at the sale knows the true condition.
  const value = lotValue(lot, day)
  const names = [...DEALER_NAMES]
  const count = rng.int(BIDDERS.min, BIDDERS.max)
  const out: Bidder[] = []
  for (let i = 0; i < count; i++) {
    const name = names.splice(rng.int(0, names.length - 1), 1)[0]
    const top = BIDDER_TOP.low + rng.next() * (BIDDER_TOP.high - BIDDER_TOP.low)
    out.push({ id: `dealer-${i}`, name, max: Math.round((value * top * heat) / 10) * 10 })
  }
  return out
}

/** What the next bid on the block has to be: the asking price, or the high bid plus the increment. */
export function nextBid(state: Pick<AuctionState, 'price' | 'high'>): number {
  return state.high === null ? state.price : state.price + bidStep(state.price)
}

/** The lot on the block, or null between runs. */
export function lotOnBlock(state: AuctionState, lots: readonly Lot[]): Lot | null {
  return state.over ? null : (lots[state.lotIndex] ?? null)
}

/** Whether the lot on the block can still be bid on. */
export function biddingOpen(state: AuctionState | null): state is AuctionState {
  return !!state && !state.over && state.call !== 'sold'
}

/** Puts lot `index` (or the next one not in `taken`) on the block, or ends the run. */
function onBlock(
  state: AuctionState,
  index: number,
  lots: readonly Lot[],
  taken: readonly string[],
  day: number,
  rng: Rng,
  heat: number,
): AuctionState {
  let i = index
  while (i < lots.length && taken.includes(lots[i].id)) i++
  if (i >= lots.length) return { ...state, lotIndex: lots.length, over: true, bidders: [] }
  return {
    ...state,
    lotIndex: i,
    price: openingBid(lots[i], day),
    high: null,
    proxy: false,
    call: 'open',
    quiet: 0,
    bidders: bidderMaxes(lots[i], day, rng, heat),
  }
}

/** What stepping the run needs besides its state. */
export interface RunContext {
  lots: readonly Lot[]
  /** Lots already bought another way today, skipped. */
  taken: readonly string[]
  day: number
  rng: Rng
  /** Scales the dealers' top bids. */
  heat?: number
  /**
   * Whether the used-car manager bids `bid` on lot `lotId` for the
   * dealership (up to the player's max bid, while they're at the auction).
   */
  proxy?: (lotId: string, bid: number) => boolean
}

/** The run at `minute` with the first lot on the block. */
export function startAuction(minute: number, ctx: RunContext): AuctionState {
  const empty: AuctionState = {
    minute,
    lotIndex: 0,
    price: 0,
    high: null,
    proxy: false,
    call: 'open',
    quiet: 0,
    bidders: [],
    results: [],
    over: false,
  }
  return onBlock(empty, 0, ctx.lots, ctx.taken, ctx.day, ctx.rng, ctx.heat ?? 1)
}

const NEXT_CALL: Record<Exclude<Call, 'sold'>, Call> = {
  open: 'once',
  once: 'twice',
  twice: 'sold',
}

/** The lot on the block sells to its high bidder, or is passed with nobody bidding. */
function hammer(state: AuctionState, lots: readonly Lot[]): AuctionState {
  const buyer =
    state.high === null
      ? null
      : state.high === PLAYER_ID
        ? PLAYER_ID
        : (state.bidders.find((b) => b.id === state.high)?.name ?? null)
  const result: LotResult = {
    lotId: lots[state.lotIndex].id,
    price: state.high === null ? 0 : state.price,
    buyer,
    ...(buyer === PLAYER_ID && state.proxy && { proxy: true as const }),
  }
  return { ...state, call: 'sold', quiet: 0, results: [...state.results, result] }
}

/**
 * One beat on the block: the used-car manager raises at once for the
 * dealership while outbid and under the max bid; otherwise a dealer still
 * under their top bid may raise (`BID_CHANCE`); otherwise it's a quiet beat,
 * and every `CALL_BEATS` of those the call moves on, selling the lot at
 * `sold`. The beat after a sale puts the next lot up.
 */
function beat(state: AuctionState, ctx: RunContext): AuctionState {
  if (state.over) return state
  if (state.call === 'sold') {
    return onBlock(state, state.lotIndex + 1, ctx.lots, ctx.taken, ctx.day, ctx.rng, ctx.heat ?? 1)
  }
  const bid = nextBid(state)
  if (state.high !== PLAYER_ID && ctx.proxy?.(ctx.lots[state.lotIndex].id, bid)) {
    return { ...state, price: bid, high: PLAYER_ID, proxy: true, call: 'open', quiet: 0 }
  }
  const keen = state.bidders.filter((b) => b.id !== state.high && b.max >= bid)
  if (keen.length > 0 && ctx.rng.next() < BID_CHANCE) {
    const by = keen[ctx.rng.int(0, keen.length - 1)]
    return { ...state, price: bid, high: by.id, proxy: false, call: 'open', quiet: 0 }
  }
  const quiet = state.quiet + 1
  if (quiet < CALL_BEATS) return { ...state, quiet }
  const call = NEXT_CALL[state.call]
  return call === 'sold' ? hammer(state, ctx.lots) : { ...state, call, quiet: 0 }
}

/**
 * Steps the run up to `minute`, a beat per `BEAT_MINUTES`. At `AUCTION_END`
 * the run closes: the lot on the block goes to its high bidder, and lots not
 * yet reached aren't sold. Returns the same state if no beat was due.
 */
export function stepAuction(state: AuctionState, minute: number, ctx: RunContext): AuctionState {
  let s = state
  while (!s.over && s.minute + BEAT_MINUTES <= minute) {
    const at = s.minute + BEAT_MINUTES
    if (at >= AUCTION_END) {
      const closed = s.call !== 'sold' && s.high !== null ? hammer(s, ctx.lots) : s
      return { ...closed, minute: at, over: true, bidders: [] }
    }
    s = { ...beat(s, ctx), minute: at }
  }
  return s
}

/**
 * The player raises to the next bid (`nextBid`) on the lot on the block.
 * Null when they can't: the lot is sold, they already hold the high bid, or
 * the run is over. The caller checks `bidBlocker` at `nextBid` first.
 */
export function playerBid(state: AuctionState): AuctionState | null {
  if (!biddingOpen(state) || state.high === PLAYER_ID) return null
  return { ...state, price: nextBid(state), high: PLAYER_ID, proxy: false, call: 'open', quiet: 0 }
}

/**
 * The player passes on the lot on the block: the dealers bid it out among
 * themselves at once, beat by beat (without moving the clock), until it
 * sells. Null while the player holds the high bid or the lot is sold. Pass
 * a `ctx` without a `proxy`, so the manager lets it go too.
 */
export function passLot(state: AuctionState, ctx: RunContext): AuctionState | null {
  if (!biddingOpen(state) || state.high === PLAYER_ID) return null
  let s = state
  // A lot always sells within a few hundred beats; the cap is only a guard.
  for (let i = 0; i < 1_000 && s.call !== 'sold'; i++) s = beat(s, ctx)
  return s
}

/** Results the run added between `prev` and `next`. */
export function newResults(prev: AuctionState | null, next: AuctionState | null): LotResult[] {
  if (!next || next.results === prev?.results) return []
  return next.results.slice(prev?.results.length ?? 0)
}

/** "Lakeside Auto, $9,250", "Yours for $9,250" (with "(manager)" on a max bid), "No bids". */
export function resultLine(r: LotResult, money: (n: number) => string): string {
  if (r.fell) return 'Fell through'
  if (r.buyer === null) return 'No bids'
  if (r.buyer === PLAYER_ID) return `Yours for ${money(r.price)}${r.proxy ? ' (manager)' : ''}`
  return `${r.buyer}, ${money(r.price)}`
}

/** How the call reads on the block. */
export const CALL_TEXT: Record<Call, string> = {
  open: 'Bidding',
  once: 'Going once…',
  twice: 'Going twice…',
  sold: 'Sold!',
}

/** The morning notice on auction day, once the auction is open to the dealership. */
export function auctionNotice(lots: number): string {
  return `It's auction day: ${lots} used cars run from ${formatTime(AUCTION_START)}. Bid on the Auction tab (J).`
}

/** The notice when the run starts. */
export const AUCTION_STARTING = 'The auction is starting: the first lot is on the block (J).'

/**
 * Whether the auctioneer has something new to say: a raise or the call
 * moving on, on a lot that's still being sold.
 */
export function auctioneerSpeaks(prev: AuctionState | null, next: AuctionState | null): boolean {
  if (!next || next.over) return false
  if (!prev) return true
  return next.price !== prev.price || next.call !== prev.call || next.lotIndex !== prev.lotIndex
}
