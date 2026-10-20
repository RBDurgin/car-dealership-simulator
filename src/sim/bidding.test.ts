import { describe, expect, it } from 'vitest'
import { runList, wholesaleValue } from './auction'
import {
  AUCTION_END,
  AUCTION_START,
  auctioneerSpeaks,
  BEAT_MINUTES,
  bidderMaxes,
  BIDDER_TOP,
  bidStep,
  CALL_BEATS,
  newResults,
  nextBid,
  openingBid,
  passLot,
  playerBid,
  resultLine,
  startAuction,
  stepAuction,
  type AuctionState,
  type RunContext,
} from './bidding'
import { PLAYER_ID } from './customers'
import { formatMoney } from './format'
import { createRng } from './rng'

const DAY = 3
const LOTS = runList(DAY, { rank: 'main-street', tier: 'bronze' })

function ctx(seed = 1, taken: string[] = []): RunContext {
  return { lots: LOTS, taken, day: DAY, rng: createRng(seed) }
}

/** Steps `state` one beat at a time until `done`, or a long while. */
function until(state: AuctionState, c: RunContext, done: (s: AuctionState) => boolean) {
  let s = state
  for (let i = 0; i < 2_000 && !done(s); i++) s = stepAuction(s, s.minute + BEAT_MINUTES, c)
  return s
}

describe('bidding basics', () => {
  it('bids in bigger steps as the price climbs', () => {
    expect(bidStep(4_900)).toBe(100)
    expect(bidStep(9_000)).toBe(250)
    expect(bidStep(20_000)).toBe(500)
  })

  it('opens a lot under its wholesale value, on the increment', () => {
    const lot = LOTS[0]
    const open = openingBid(lot, DAY)
    expect(open).toBeLessThan(wholesaleValue(lot.car.model, lot.car, DAY))
    expect(open % bidStep(open)).toBe(0)
  })

  it('brings three to five dealers, their top bids around wholesale', () => {
    const lot = LOTS[0]
    const value = wholesaleValue(lot.car.model, lot.car, DAY)
    for (let seed = 1; seed < 30; seed++) {
      const bidders = bidderMaxes(lot, DAY, createRng(seed))
      expect(bidders.length).toBeGreaterThanOrEqual(3)
      expect(bidders.length).toBeLessThanOrEqual(5)
      expect(new Set(bidders.map((b) => b.name)).size).toBe(bidders.length)
      for (const b of bidders) {
        expect(b.max).toBeGreaterThanOrEqual(value * BIDDER_TOP.low - 10)
        expect(b.max).toBeLessThanOrEqual(value * BIDDER_TOP.high + 10)
      }
    }
    const hot = bidderMaxes(lot, DAY, createRng(1), 1.1)
    const cool = bidderMaxes(lot, DAY, createRng(1))
    expect(hot[0].max).toBeGreaterThan(cool[0].max)
  })
})

describe('the run', () => {
  it('starts with the first lot on the block at its opening bid', () => {
    const run = startAuction(AUCTION_START, ctx())
    expect(run).toMatchObject({ lotIndex: 0, high: null, call: 'open', results: [] })
    expect(run.price).toBe(openingBid(LOTS[0], DAY))
  })

  it('skips lots already bought', () => {
    const run = startAuction(AUCTION_START, ctx(1, [LOTS[0].id]))
    expect(run.lotIndex).toBe(1)
  })

  it('steps nothing before the next beat is due', () => {
    const run = startAuction(AUCTION_START, ctx())
    expect(stepAuction(run, AUCTION_START + BEAT_MINUTES / 2, ctx())).toBe(run)
  })

  it('the dealers stop at their top bids, and the best of them buys', () => {
    const c = ctx(4)
    const run = startAuction(AUCTION_START, c)
    const top = Math.max(...run.bidders.map((b) => b.max))
    const sold = until(run, c, (s) => s.call === 'sold')
    const [result] = sold.results
    expect(result.lotId).toBe(LOTS[0].id)
    expect(result.price).toBeLessThanOrEqual(top)
    // Nobody else would have paid the next step.
    const winner = sold.bidders.find((b) => b.name === result.buyer)!
    expect(winner.max).toBe(top)
    for (const b of sold.bidders) if (b !== winner) expect(b.max).toBeLessThan(nextBid(sold))
  })

  it('goes once, twice, sold while nobody raises', () => {
    const c = ctx(4)
    let s = startAuction(AUCTION_START, c)
    // Nobody can outbid a high bid over every top bid.
    s = { ...s, price: 1_000_000, high: 'dealer-0' }
    const calls: string[] = []
    for (let i = 0; i < 3 * CALL_BEATS; i++) {
      s = stepAuction(s, s.minute + BEAT_MINUTES, c)
      calls.push(s.call)
    }
    expect(calls.filter((x, i) => x !== calls[i - 1])).toEqual(['open', 'once', 'twice', 'sold'])
    expect(s.results).toHaveLength(1)
    // The next beat puts the next lot up.
    s = stepAuction(s, s.minute + BEAT_MINUTES, c)
    expect(s).toMatchObject({ lotIndex: 1, call: 'open', high: null })
  })

  it('passes a lot nobody opens', () => {
    const c = ctx(4)
    let s = startAuction(AUCTION_START, c)
    s = { ...s, bidders: s.bidders.map((b) => ({ ...b, max: 0 })) }
    s = until(s, c, (x) => x.call === 'sold')
    expect(s.results[0]).toEqual({ lotId: LOTS[0].id, price: 0, buyer: null })
    expect(resultLine(s.results[0], formatMoney)).toBe('No bids')
  })

  it('runs every lot and is over, well inside the window', () => {
    const c = ctx(9)
    const end = until(startAuction(AUCTION_START, c), c, (s) => s.over)
    expect(end.results).toHaveLength(LOTS.length)
    expect(end.minute).toBeLessThan(AUCTION_END)
  })

  it('closes at the end of the window, selling the lot on the block to its high bidder', () => {
    const c = ctx(4)
    let s = startAuction(AUCTION_START, c)
    s = { ...s, minute: AUCTION_END - BEAT_MINUTES, high: 'dealer-0' }
    s = stepAuction(s, AUCTION_END, c)
    expect(s.over).toBe(true)
    expect(s.results).toHaveLength(1)
  })
})

describe('the player', () => {
  it('bids the asking price to open, then the next increment', () => {
    const c = ctx(4)
    const run = startAuction(AUCTION_START, c)
    const opened = playerBid(run)!
    expect(opened).toMatchObject({ high: PLAYER_ID, price: run.price, call: 'open' })
    const raised = playerBid({ ...opened, high: 'dealer-0' })!
    expect(raised.price).toBe(run.price + bidStep(run.price))
  })

  it('can’t outbid themselves or bid on a sold lot', () => {
    const run = playerBid(startAuction(AUCTION_START, ctx()))!
    expect(playerBid(run)).toBeNull()
    expect(playerBid({ ...run, high: null, call: 'sold' })).toBeNull()
  })

  it('wins a lot nobody else will pay more for', () => {
    const c = ctx(4)
    let s = startAuction(AUCTION_START, c)
    const top = Math.max(...s.bidders.map((b) => b.max))
    // Bid whenever outbid until past every dealer.
    for (let i = 0; i < 2_000 && s.call !== 'sold'; i++) {
      if (s.high !== PLAYER_ID) s = playerBid(s)!
      s = stepAuction(s, s.minute + BEAT_MINUTES, c)
    }
    expect(s.results[0].buyer).toBe(PLAYER_ID)
    expect(s.results[0].price).toBeLessThanOrEqual(top + bidStep(top))
    expect(resultLine(s.results[0], formatMoney)).toMatch(/^Yours for \$/)
  })

  it('passing lets the dealers bid the lot out at once, without moving the clock', () => {
    const c = ctx(4)
    const run = startAuction(AUCTION_START, c)
    const passed = passLot(run, c)!
    expect(passed.call).toBe('sold')
    expect(passed.minute).toBe(run.minute)
    expect(passed.results[0].buyer).not.toBe(PLAYER_ID)
    expect(newResults(run, passed)).toEqual(passed.results)
    // Not while they hold the high bid.
    expect(passLot(playerBid(run)!, c)).toBeNull()
  })
})

describe('the auctioneer', () => {
  it('speaks on a raise or a call, not on a quiet beat', () => {
    const run = startAuction(AUCTION_START, ctx())
    expect(auctioneerSpeaks(null, run)).toBe(true)
    expect(auctioneerSpeaks(run, { ...run, quiet: 1 })).toBe(false)
    expect(auctioneerSpeaks(run, { ...run, call: 'once' })).toBe(true)
    expect(auctioneerSpeaks(run, { ...run, price: run.price + 250 })).toBe(true)
    expect(auctioneerSpeaks(run, { ...run, over: true })).toBe(false)
  })
})
