import { describe, expect, it } from 'vitest'
import { isSlowLot, lotValue, runList, SLOW_LOT_CHANCE, SLOW_LOT_HEAT } from './auction'
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
  nazmaMax,
  NAZMA_EAGER,
  NAZMA_SKIP,
  NAZMA_STRENGTH,
  NAZMA_TOP,
  nextBid,
  openingBid,
  passLot,
  playerBid,
  resultLine,
  RIVAL_BIDDER,
  rivalBidder,
  startAuction,
  stepAuction,
  type AuctionState,
  type RunContext,
} from './bidding'
import { PLAYER_ID } from './customers'
import { formatMoney } from './format'
import { createRng } from './rng'
import { emptyRival, OPEN_STRENGTH, type Rival } from './rival'

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
    expect(open).toBeLessThan(lotValue(lot, DAY))
    expect(open % bidStep(open)).toBe(0)
  })

  it('brings three to five dealers, their top bids around wholesale', () => {
    const lot = LOTS[0]
    const value = lotValue(lot, DAY)
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

describe('the used-car manager’s max bid', () => {
  /** A run with the manager bidding up to `max` on the first lot. */
  const withMax = (max: number, seed = 4): RunContext => ({
    ...ctx(seed),
    proxy: (lotId, bid) => lotId === LOTS[0].id && bid <= max,
  })
  const sell = (c: RunContext) =>
    until(startAuction(AUCTION_START, c), c, (s) => s.results.length > 0)

  it('wins a lot under the max when the dealers stop short of it', () => {
    const top = Math.max(...startAuction(AUCTION_START, ctx(4)).bidders.map((b) => b.max))
    const max = top + 5 * bidStep(top)
    const [result] = sell(withMax(max)).results
    expect(result).toMatchObject({ lotId: LOTS[0].id, buyer: PLAYER_ID, proxy: true })
    expect(result.price).toBeLessThanOrEqual(max)
    expect(result.price).toBeLessThanOrEqual(top + bidStep(top))
    expect(resultLine(result, formatMoney)).toMatch(/^Yours for \$[\d,]+ \(manager\)$/)
  })

  it('never goes over the max, and loses to a dealer who will', () => {
    const run = startAuction(AUCTION_START, ctx(4))
    const max = run.price + bidStep(run.price)
    const [result] = sell(withMax(max)).results
    expect(result.buyer).not.toBe(PLAYER_ID)
    expect(result.price).toBeGreaterThan(max)
  })

  it('raises at once when outbid, and not on a lot without a max', () => {
    const c = withMax(1_000_000)
    const run = startAuction(AUCTION_START, c)
    const s = stepAuction({ ...run, high: 'dealer-0' }, run.minute + BEAT_MINUTES, c)
    expect(s).toMatchObject({
      high: PLAYER_ID,
      proxy: true,
      price: nextBid({ ...run, high: 'dealer-0' }),
    })
    // The player's own bid isn't the manager's.
    expect(playerBid({ ...s, high: 'dealer-0' })!.proxy).toBe(false)
    // The second lot has no max: the dealers have it.
    const next = until(s, c, (x) => x.results.length > 1)
    expect(next.results[1].buyer).not.toBe(PLAYER_ID)
  })

  it('lets a passed lot go', () => {
    const c = withMax(1_000_000)
    const passed = passLot(startAuction(AUCTION_START, c), ctx(4))!
    expect(passed.results[0].buyer).not.toBe(PLAYER_ID)
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

describe('Nazma at the auction', () => {
  const open: Rival = { ...emptyRival(), status: 'open', strength: OPEN_STRENGTH, shares: [0.2] }

  it('bids only while his lot is open, harder the more desperate and the stronger he is', () => {
    expect(rivalBidder(emptyRival())).toBeNull()
    expect(rivalBidder({ ...open, status: 'closed' })).toBeNull()
    const calm = rivalBidder(open)!
    expect(calm).toEqual({ name: open.name, eager: NAZMA_TOP })
    const desperate = rivalBidder({ ...open, shares: [0.01] })!
    expect(desperate.eager).toBeCloseTo(NAZMA_TOP + NAZMA_EAGER)
    const strong = rivalBidder({ ...open, strength: OPEN_STRENGTH + 10 })!
    expect(strong.eager).toBeCloseTo(NAZMA_TOP + 10 * NAZMA_STRENGTH)
  })

  it('sits out some lots and never bids on a car he stole', () => {
    const lots = Array.from({ length: 100 }, (_, w) =>
      runList(DAY + w * 7, { rank: 'main-street', tier: 'bronze' }),
    ).flat()
    const nazma = rivalBidder(open)!
    const bids = lots.map((l) => nazmaMax(l, 10_000, nazma))
    const skipped = bids.filter((b) => b === null).length / bids.length
    expect(skipped).toBeGreaterThan(NAZMA_SKIP - 0.1)
    expect(skipped).toBeLessThan(NAZMA_SKIP + 0.1)
    for (const b of bids) {
      if (b !== null) expect(b / 10_000).toBeCloseTo(NAZMA_TOP, 1)
    }
    expect(nazmaMax({ ...LOTS[0], stolen: 'used-1-1' }, 10_000, nazma)).toBeNull()
  })

  it('joins the dealers on a lot without changing their bids, and his win is marked', () => {
    const lot = lots().find((l) => nazmaMax(l, 10_000, rivalBidder(open)!) !== null)!
    const dealers = bidderMaxes(lot, DAY, createRng(5))
    const keen = { name: open.name, eager: 3 }
    const withHim = bidderMaxes(lot, DAY, createRng(5), 1, keen)
    expect(withHim.slice(0, -1)).toEqual(dealers)
    expect(withHim.at(-1)).toMatchObject({ id: RIVAL_BIDDER, name: open.name })
    const run = until(
      startAuction(AUCTION_START, { ...ctx(5), lots: [lot], nazma: keen }),
      ctx(5),
      (s) => s.over,
    )
    expect(run.results[0]).toMatchObject({ buyer: open.name, rival: true })
  })

  it('pushes prices up on the lots he bids on while he’s desperate', () => {
    const desperate = rivalBidder({ ...open, shares: [0.01] })!
    let without = 0
    let withHim = 0
    for (let w = 0; w < 100; w++) {
      const day = DAY + w * 7
      const lots = runList(day, { rank: 'main-street', tier: 'bronze' })
      const sold = (nazma: typeof desperate | null) => {
        const c: RunContext = { lots, taken: [], day, rng: createRng(day), nazma }
        return stepAuction(startAuction(AUCTION_START, c), AUCTION_END, c).results
      }
      const a = sold(null)
      const b = sold(desperate)
      for (const lot of lots) {
        if (nazmaMax(lot, 10_000, desperate) === null) continue
        without += a.find((r) => r.lotId === lot.id)?.price ?? 0
        withHim += b.find((r) => r.lotId === lot.id)?.price ?? 0
      }
    }
    expect(withHim / without).toBeGreaterThan(1.03)
    expect(withHim / without).toBeLessThan(1.12)
  })
})

describe('slow lots', () => {
  it('has the dealers cool on about one lot in ten', () => {
    const lots = Array.from({ length: 100 }, (_, w) =>
      runList(DAY + w * 7, { rank: 'main-street', tier: 'bronze' }),
    ).flat()
    const slow = lots.filter(isSlowLot)
    expect(slow.length / lots.length).toBeGreaterThan(SLOW_LOT_CHANCE - 0.04)
    expect(slow.length / lots.length).toBeLessThan(SLOW_LOT_CHANCE + 0.04)
    for (const lot of slow) {
      const value = lotValue(lot, lot.car.acquiredDay)
      for (const b of bidderMaxes(lot, lot.car.acquiredDay, createRng(2))) {
        expect(b.max).toBeLessThanOrEqual(Math.round(value * BIDDER_TOP.high * SLOW_LOT_HEAT) + 10)
      }
    }
  })
})

function lots() {
  return Array.from({ length: 10 }, (_, w) =>
    runList(DAY + w * 7, { rank: 'main-street', tier: 'bronze' }),
  ).flat()
}
