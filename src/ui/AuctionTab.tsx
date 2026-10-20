import {
  AUCTION_RANK,
  auctionOpen,
  BUYER_FEE,
  isAuctionDay,
  lotEstimate,
  nextAuction,
  type Lot,
} from '../sim/auction'
import {
  AUCTION_START,
  CALL_TEXT,
  lotOnBlock,
  nextBid,
  resultLine,
  type AuctionState,
  type LotResult,
} from '../sim/bidding'
import { longDate } from '../sim/calendar'
import { formatTime } from '../sim/clock'
import { PLAYER_ID } from '../sim/customers'
import { carName } from '../sim/interactables'
import { rankById } from '../sim/progression'
import { auctionBidBlocker, lotRoom, runListFor } from '../state/selectors'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** "today", "tomorrow", "in 3 days". */
function untilText(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

function LotRow({ lot, day, won }: { lot: Lot; day: number; won: boolean }) {
  const { low, high } = lotEstimate(lot, day)
  return (
    <li className={won ? 'auction-won' : undefined}>
      <span className="muted">{lot.order}</span>
      <span>
        {lot.car.year} {carName(lot.car.model)}
      </span>
      <span>{lot.grade}</span>
      <span className="muted auction-miles">{Math.round(lot.car.miles / 1000)}k mi</span>
      <span className="price">
        {won ? 'Bought' : `${formatMoney(low)}–${formatMoney(high).replace('$', '')}`}
      </span>
    </li>
  )
}

/** The week's run list, once it's posted on the Monday before the auction. */
function RunList({ day }: { day: number }) {
  const lots = useGame(runListFor)
  const wins = useGame((s) => s.auctionWins)
  const room = useGame(lotRoom)
  return (
    <>
      <h3>
        Run list <span className="muted">· {lots.length} lots · estimates at wholesale</span>
      </h3>
      <ul className="auction-lots">
        {lots.map((lot) => (
          <LotRow key={lot.id} lot={lot} day={day} won={wins.some((w) => w.lotId === lot.id)} />
        ))}
      </ul>
      <NoRoom room={room} />
    </>
  )
}

function NoRoom({ room }: { room: boolean }) {
  if (room) return null
  return <p className="cal-intro">No room on the lot: a car won needs a free lot space.</p>
}

/** "Ridgeway Motors", "You", or the asking price while nobody has bid. */
function highText(run: AuctionState): string {
  if (run.high === null) return `Asking ${formatMoney(run.price)}`
  if (run.high === PLAYER_ID) return 'You have the high bid'
  return run.bidders.find((b) => b.id === run.high)?.name ?? 'A dealer'
}

/** The lot on the block: the car, the price, who's high, the call, and Bid and Pass. */
function OnBlock({ lot, run, day }: { lot: Lot; run: AuctionState; day: number }) {
  const blocker = useGame(auctionBidBlocker)
  const { low, high } = lotEstimate(lot, day)
  const sold = run.call === 'sold'
  const mine = run.high === PLAYER_ID
  const bid = nextBid(run)
  return (
    <div className={mine ? 'auction-block auction-mine' : 'auction-block'}>
      <div className="auction-car">
        <b>
          Lot {lot.order}: {lot.car.year} {carName(lot.car.model)}
        </b>
        <span className="muted">
          {lot.grade} · {Math.round(lot.car.miles / 1000)}k mi · est. {formatMoney(low)}–
          {formatMoney(high).replace('$', '')}
        </span>
      </div>
      <div className="auction-price">
        <span className="auction-amount">{run.high === null ? '—' : formatMoney(run.price)}</span>
        <span>{highText(run)}</span>
        <span className={`auction-call auction-call-${run.call}`}>{CALL_TEXT[run.call]}</span>
      </div>
      <div className="auction-actions">
        <button
          className="btn btn-primary"
          disabled={sold || mine || !!blocker}
          title={blocker ?? undefined}
          onClick={() => useGame.getState().auctionBid()}
        >
          Bid {formatMoney(bid)}
        </button>
        <button
          className="btn"
          disabled={sold || mine}
          title="Let the dealers bid it out and move to the next lot"
          onClick={() => useGame.getState().auctionPass()}
        >
          Pass
        </button>
        {blocker && !sold && !mine && <span className="muted">{blocker}</span>}
      </div>
    </div>
  )
}

function ResultRow({ r, lots }: { r: LotResult; lots: readonly Lot[] }) {
  const lot = lots.find((l) => l.id === r.lotId)
  if (!lot) return null
  return (
    <li className={r.buyer === PLAYER_ID && !r.fell ? 'auction-yours' : undefined}>
      <span className="muted">{lot.order}</span>
      <span>
        {lot.car.year} {carName(lot.car.model)} <span className="muted">· {lot.grade}</span>
      </span>
      <span className="price">{resultLine(r, formatMoney)}</span>
    </li>
  )
}

/** What sold and for how much: the going prices. */
function Results({ results, lots }: { results: readonly LotResult[]; lots: readonly Lot[] }) {
  if (results.length === 0) return null
  return (
    <>
      <h3>Sold</h3>
      <ul className="auction-lots auction-results">
        {results.map((r) => (
          <ResultRow key={r.lotId} r={r} lots={lots} />
        ))}
      </ul>
    </>
  )
}

/** The run under way: the lot on the block, what's sold and what's still to come. */
function LiveAuction({ day }: { day: number }) {
  const run = useGame((s) => s.auction)!
  const lots = useGame(runListFor)
  const room = useGame(lotRoom)
  const lot = lotOnBlock(run, lots)
  const done = new Set(run.results.map((r) => r.lotId))
  const toCome = lots.slice(run.lotIndex + 1).filter((l) => !done.has(l.id))
  return (
    <>
      {lot && <OnBlock lot={lot} run={run} day={day} />}
      <NoRoom room={room} />
      <Results results={run.results} lots={lots} />
      {toCome.length > 0 && (
        <>
          <h3>Still to come</h3>
          <ul className="auction-lots">
            {toCome.map((l) => (
              <LotRow key={l.id} lot={l} day={day} won={false} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

const NO_RESULTS: LotResult[] = []

/** After the run: what each lot went for. */
function RunResults() {
  const results = useGame((s) => s.auction?.results ?? NO_RESULTS)
  const lots = useGame(runListFor)
  return (
    <>
      <p className="cal-intro">The run is over. Next week&apos;s list goes up on Monday.</p>
      <Results results={results} lots={lots} />
    </>
  )
}

/** Today's auction: before the run, the list; then the run; then the results. */
function AuctionDay({ day }: { day: number }) {
  const status = useGame((s) => (!s.auction ? 'before' : s.auction.over ? 'over' : 'live'))
  if (status === 'live') return <LiveAuction day={day} />
  if (status === 'over') return <RunResults />
  return (
    <>
      <p className="cal-intro">
        The run starts at <b>{formatTime(AUCTION_START)}</b>. Lots come up one at a time: bid
        against the other dealers, or pass.
      </p>
      <RunList day={day} />
    </>
  )
}

/**
 * The dealer auction: when the next one is and the week's run list, each lot
 * with its grade, miles and what the trade is likely to pay. Before the
 * dealership has the rank, only what opens it.
 */
export function AuctionTab() {
  const open = useGame((s) => auctionOpen(s.career))
  const day = useGame((s) => s.clock.day)
  const next = nextAuction(day)
  return (
    <>
      <h2>
        Dealer auction <span className="muted">· Wednesdays</span>
      </h2>
      {!open ? (
        <p className="muted cal-intro">
          Every Wednesday the trade sells used cars at the dealer auction. It opens to you at{' '}
          {rankById(AUCTION_RANK).name}.
        </p>
      ) : (
        <>
          {isAuctionDay(day) ? (
            <AuctionDay day={day} />
          ) : (
            <>
              <p className="cal-intro">
                The next auction is {untilText(next - day)}: <b>{longDate(next)}</b>.
              </p>
              {next - day <= 2 ? (
                <RunList day={day} />
              ) : (
                <p className="muted cal-intro">Its run list is posted on the Monday before.</p>
              )}
            </>
          )}
          <p className="muted cal-intro">
            The trade pays a little under what a used car would fetch on your lot, since it still
            has to be sold. A car you win costs the price plus the buyer fee (
            {formatMoney(BUYER_FEE.flat)} and {Math.round(BUYER_FEE.share * 100)}% of the price), is
            paid in cash, needs a free lot space and is on the lot the next morning. The office
            computer doesn&apos;t stop the clock: the floor keeps running while you bid.
          </p>
        </>
      )}
    </>
  )
}
