import {
  AUCTION_RANK,
  auctionOpen,
  BUYER_FEE,
  INSPECT_FEE,
  inspectBlocker,
  isAuctionDay,
  lotEstimate,
  lotReading,
  lotValue,
  maxBidBlocker,
  maxBidFor,
  nextAuction,
  wholesaleValue,
  type Inspection,
  type Lot,
} from '../sim/auction'
import {
  AUCTION_START,
  bidStep,
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
import { NO_CASH } from '../sim/sellers'
import { usedCarManager } from '../sim/staff'
import { BUYER_LEAVE } from '../sim/staffAi'
import { DAILY_DEPRECIATION } from '../sim/usedCars'
import {
  AUTO_WHOLESALE_DAYS,
  MAX_CONSIGNED,
  RUN_FEE,
  SELLER_FEE,
  wholesaleSuggestions,
  type Consignment,
} from '../sim/wholesale'
import { auctionBidBlocker, auctionLotsFor, lotRoom } from '../state/selectors'
import { useGame } from '../state/store'
import { formatMoney } from './format'

/** "today", "tomorrow", "in 3 days". */
function untilText(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/** The player's inspection of `lot`, if they've had one. */
function useInspection(lot: Lot): Inspection | null {
  return useGame((s) => s.inspected.find((i) => i.lotId === lot.id) ?? null)
}

/** "Fair", or "Worn ✓" once inspected, with what the sheet said in its tooltip. */
function GradeText({ lot, inspection }: { lot: Lot; inspection: Inspection | null }) {
  const { grade } = lotReading(lot, inspection)
  if (!inspection)
    return <span title="The sheet's grade: the car may be a step worse">{grade}</span>
  return (
    <span className="auction-inspected" title={`Inspected. The sheet said ${lot.grade}.`}>
      {grade} ✓
    </span>
  )
}

/** Inspect, while the lot can still be inspected; nothing once it's done or too late. */
function InspectButton({ lot }: { lot: Lot }) {
  const blocker = useGame((s) => inspectBlocker(lot, s.clock.day, s.auction, s.inspected, s.cash))
  if (blocker && blocker !== NO_CASH) return <span />
  return (
    <button
      className="btn btn-small"
      disabled={!!blocker}
      title={
        blocker ??
        `Have the car looked over for ${formatMoney(INSPECT_FEE)}: a truer grade and a tighter estimate`
      }
      onClick={() => useGame.getState().inspectLot(lot.id)}
    >
      Inspect
    </button>
  )
}

/** The used-car manager's max bid on `lot`, set with − and + by the auction's increment. */
function MaxBid({ lot, day }: { lot: Lot; day: number }) {
  const max = useGame((s) => maxBidFor(s.auctionBids, lot.id))
  const late = useGame((s) => !!maxBidBlocker(lot, s.clock.day, s.auction, true))
  const inspection = useInspection(lot)
  if (late) {
    return max > 0 ? <span className="auction-max muted">Max bid {formatMoney(max)}</span> : null
  }
  const set = (n: number) => useGame.getState().setMaxBid(lot.id, n)
  const value = lotValue(lot, day, inspection)
  const start = Math.floor(value / bidStep(value)) * bidStep(value)
  return (
    <span className="auction-max">
      <span className="muted">Max bid</span>
      {max === 0 ? (
        <button
          className="btn btn-small"
          title="Your used-car manager bids up to this for you at the auction"
          onClick={() => set(start)}
        >
          Set
        </button>
      ) : (
        <>
          <button
            className="btn btn-small"
            aria-label="Lower the max bid"
            onClick={() => set(max - bidStep(max - 1))}
          >
            −
          </button>
          <b>{formatMoney(max)}</b>
          <button
            className="btn btn-small"
            aria-label="Raise the max bid"
            onClick={() => set(max + bidStep(max))}
          >
            +
          </button>
          <button className="btn btn-small" title="No max bid" onClick={() => set(0)}>
            ✕
          </button>
        </>
      )}
    </span>
  )
}

function LotRow({
  lot,
  day,
  won,
  manager,
}: {
  lot: Lot
  day: number
  won: boolean
  manager: boolean
}) {
  const inspection = useInspection(lot)
  const { low, high } = lotEstimate(lot, day, inspection)
  if (lot.consigned) return <YoursRow lot={lot} low={low} high={high} />
  return (
    <li className={won ? 'auction-won' : undefined}>
      <span className="muted">{lot.order}</span>
      <span>
        {lot.car.year} {carName(lot.car.model)}
      </span>
      <GradeText lot={lot} inspection={inspection} />
      <span className="muted auction-miles">{Math.round(lot.car.miles / 1000)}k mi</span>
      <span className="price">
        {won ? 'Bought' : `${formatMoney(low)}–${formatMoney(high).replace('$', '')}`}
      </span>
      {won ? <span /> : <InspectButton lot={lot} />}
      {manager && !won && <MaxBid lot={lot} day={day} />}
    </li>
  )
}

/** One of our consigned cars in the run: no bidding, just its estimate and floor. */
function YoursRow({ lot, low, high }: { lot: Lot; low: number; high: number }) {
  const floor = lot.consigned?.floor ?? 0
  return (
    <li className="auction-yours">
      <span className="muted">{lot.order}</span>
      <span>
        {lot.car.year} {carName(lot.car.model)} <span className="stock-badge">Yours</span>
      </span>
      <span>{lot.grade}</span>
      <span className="muted auction-miles">{Math.round(lot.car.miles / 1000)}k mi</span>
      <span className="price">
        {formatMoney(low)}–{formatMoney(high).replace('$', '')}
      </span>
      <span className="muted">{floor > 0 ? `Floor ${formatMoney(floor)}` : 'No floor'}</span>
    </li>
  )
}

/** The week's run list, once it's posted on the Monday before the auction. */
function RunList({ day }: { day: number }) {
  const lots = useGame(auctionLotsFor)
  const wins = useGame((s) => s.auctionWins)
  const room = useGame(lotRoom)
  const manager = useGame((s) => !!usedCarManager(s.roster))
  return (
    <>
      <h3>
        Run list <span className="muted">· {lots.length} lots · estimates at wholesale</span>
      </h3>
      <ul className="auction-lots">
        {lots.map((lot) => (
          <LotRow
            key={lot.id}
            lot={lot}
            day={day}
            won={wins.some((w) => w.lotId === lot.id)}
            manager={manager}
          />
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
  if (run.high === PLAYER_ID)
    return run.proxy ? 'Your manager has the high bid' : 'You have the high bid'
  return run.bidders.find((b) => b.id === run.high)?.name ?? 'A dealer'
}

/** The lot on the block: the car, the price, who's high, the call, and Bid and Pass. */
function OnBlock({ lot, run, day }: { lot: Lot; run: AuctionState; day: number }) {
  const blocker = useGame(auctionBidBlocker)
  const inspection = useInspection(lot)
  const { low, high } = lotEstimate(lot, day, inspection)
  const sold = run.call === 'sold'
  const mine = run.high === PLAYER_ID
  const bid = nextBid(run)
  const floor = lot.consigned?.floor ?? 0
  return (
    <div className={mine ? 'auction-block auction-mine' : 'auction-block'}>
      <div className="auction-car">
        <b>
          Lot {lot.order}: {lot.car.year} {carName(lot.car.model)}
        </b>
        <span className="muted">
          <GradeText lot={lot} inspection={inspection} /> · {Math.round(lot.car.miles / 1000)}k mi ·
          est. {formatMoney(low)}–{formatMoney(high).replace('$', '')}
        </span>
      </div>
      <div className="auction-price">
        <span className="auction-amount">{run.high === null ? '—' : formatMoney(run.price)}</span>
        <span>{highText(run)}</span>
        <span className={`auction-call auction-call-${run.call}`}>{CALL_TEXT[run.call]}</span>
      </div>
      {lot.consigned ? (
        <div className="auction-actions muted">
          Your car: the dealers bid it out.{' '}
          {floor > 0 ? `It sells only at ${formatMoney(floor)} or more.` : 'No floor.'}
        </div>
      ) : (
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
      )}
    </div>
  )
}

function ResultRow({ r, lots }: { r: LotResult; lots: readonly Lot[] }) {
  const lot = lots.find((l) => l.id === r.lotId)
  return lot ? <ResultLine r={r} lot={lot} /> : null
}

function ResultLine({ r, lot }: { r: LotResult; lot: Lot }) {
  const inspection = useInspection(lot)
  return (
    <li
      className={(r.buyer === PLAYER_ID && !r.fell) || lot.consigned ? 'auction-yours' : undefined}
    >
      <span className="muted">{lot.order}</span>
      <span>
        {lot.car.year} {carName(lot.car.model)}{' '}
        <span className="muted">· {lotReading(lot, inspection).grade}</span>
        {lot.consigned && <span className="stock-badge">Yours</span>}
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
  const lots = useGame(auctionLotsFor)
  const room = useGame(lotRoom)
  const manager = useGame((s) => !!usedCarManager(s.roster))
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
              <LotRow key={l.id} lot={l} day={day} won={false} manager={manager} />
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
  const lots = useGame(auctionLotsFor)
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
        against the other dealers, or pass. Until a lot runs you can still have it inspected.
      </p>
      <RunList day={day} />
    </>
  )
}

/** What the used-car manager does at the auction, or that one can be hired. */
function ManagerNote() {
  const name = useGame((s) => usedCarManager(s.roster)?.name ?? null)
  if (!name) {
    return (
      <p className="muted cal-intro">
        A used-car manager (hired from the Staff panel) inspects the run list for you and bids max
        bids you set while you work the floor.
      </p>
    )
  }
  return (
    <p className="muted cal-intro">
      {name}, your used-car manager, inspects the run list the day before the auction and, from{' '}
      {formatTime(BUYER_LEAVE)} until the run is over, bids for any lot with a max bid whenever
      you&apos;re outbid, up to that max. Bid yourself to go higher.
    </p>
  )
}

/** When the auction a car consigned today runs: "tomorrow", "in 3 days", or "next week" on auction day. */
function whichAuction(day: number): string {
  return isAuctionDay(day) ? 'next week' : untilText(nextAuction(day) - day)
}

/** A consigned car's floor, set with − and + by the auction's increment. */
function Floor({ c, value }: { c: Consignment; value: number }) {
  const set = (n: number) => useGame.getState().setFloor(c.carId, n)
  const start = Math.floor(value / bidStep(value)) * bidStep(value)
  return (
    <span className="auction-max">
      <span className="muted">Floor</span>
      {c.floor === 0 ? (
        <button
          className="btn btn-small"
          title={`Under the floor it isn't sold, and comes back for the ${formatMoney(RUN_FEE)} run fee`}
          onClick={() => set(start)}
        >
          Set
        </button>
      ) : (
        <>
          <button
            className="btn btn-small"
            aria-label="Lower the floor"
            onClick={() => set(c.floor - bidStep(c.floor - 1))}
          >
            −
          </button>
          <b>{formatMoney(c.floor)}</b>
          <button
            className="btn btn-small"
            aria-label="Raise the floor"
            onClick={() => set(c.floor + bidStep(c.floor))}
          >
            +
          </button>
          <button className="btn btn-small" title="No floor" onClick={() => set(0)}>
            ✕
          </button>
        </>
      )}
    </span>
  )
}

/** A car marked for the next auction: what the trade may pay, its floor, and Keep. */
function ConsignedRow({ c, day }: { c: Consignment; day: number }) {
  const car = useGame(
    (s) =>
      s.inventory.find((x) => x.id === c.carId) ??
      s.purchases.find((p) => p.id === c.carId) ??
      null,
  )
  if (!car) return null
  const info = 'used' in car ? car.used : car.car
  const model = 'used' in car ? car.model : car.car.model
  const cost = 'used' in car ? car.cost : car.price
  if (!info) return null
  // Its value on auction day, a few more days' depreciation off.
  const auctionDay = nextAuction(day)
  const value = wholesaleValue(model, info, auctionDay)
  return (
    <li>
      <span>
        {info.year} {carName(model)}{' '}
        <span className="muted">· {Math.round(info.miles / 1000)}k mi</span>
      </span>
      <span className="price" title="What the trade pays for it on auction day, about">
        ~{formatMoney(value)}
      </span>
      <span className="muted">cost {formatMoney(cost)}</span>
      <button
        className="btn btn-small"
        title="Keep it on the lot"
        onClick={() => useGame.getState().unconsign(c.carId)}
      >
        Keep
      </button>
      <Floor c={c} value={value} />
    </li>
  )
}

/** The used-car manager's stale picks to wholesale. */
function Suggestions({ day, name }: { day: number; name: string }) {
  const inventory = useGame((s) => s.inventory)
  const consigned = useGame((s) => s.consigned)
  const picks = wholesaleSuggestions(inventory, consigned, day)
  if (picks.length === 0) return null
  const full = consigned.length >= MAX_CONSIGNED
  return (
    <>
      <h3>
        {name} suggests <span className="muted">· stale used cars</span>
      </h3>
      <ul className="auction-lots auction-consigned">
        {picks.map((car) => (
          <li key={car.id}>
            <span>
              {car.used!.year} {carName(car.model)}{' '}
              <span className="muted">· {day - car.used!.acquiredDay} days in stock</span>
            </span>
            <span className="price">~{formatMoney(wholesaleValue(car.model, car.used!, day))}</span>
            <span className="muted">cost {formatMoney(car.cost)}</span>
            <button
              className="btn btn-small"
              disabled={full}
              title={
                full ? `The auction takes up to ${MAX_CONSIGNED} of your cars a week.` : undefined
              }
              onClick={() => useGame.getState().consign(car.id)}
            >
              Wholesale
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Wholesale: our cars marked for the next auction, the used-car manager's
 * picks and their auto-wholesale toggle.
 */
function Wholesale({ day }: { day: number }) {
  const consigned = useGame((s) => s.consigned)
  const manager = useGame((s) => usedCarManager(s.roster)?.name ?? null)
  const auto = useGame((s) => s.autoWholesale)
  return (
    <>
      <h3>
        Wholesale{' '}
        <span className="muted">
          · {consigned.length} of {MAX_CONSIGNED} for the auction {whichAuction(day)}
        </span>
      </h3>
      {consigned.length === 0 ? (
        <p className="muted cal-intro">
          Nothing consigned. Send a used car you&apos;d rather not keep with <b>Wholesale</b> on the
          car or in the Stock tab.
        </p>
      ) : (
        <ul className="auction-lots auction-consigned">
          {consigned.map((c) => (
            <ConsignedRow key={c.carId} c={c} day={day} />
          ))}
        </ul>
      )}
      {manager && <Suggestions day={day} name={manager} />}
      {manager && (
        <p className="cal-intro">
          <label>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => useGame.getState().setAutoWholesale(e.target.checked)}
            />{' '}
            Auto-wholesale: {manager} sends used cars held {AUTO_WHOLESALE_DAYS}+ days the morning
            before each auction (no floor).
          </label>
        </p>
      )}
      <p className="muted cal-intro">
        A consigned car stays for sale until auction morning, then runs after the list as a lot
        badged Yours. It goes to the highest dealer, less the seller fee (
        {formatMoney(SELLER_FEE.flat)} and {(SELLER_FEE.share * 100).toFixed(1)}% of the price). Set
        a floor and it won&apos;t sell under it: it comes back the next morning, less a{' '}
        {formatMoney(RUN_FEE)} run fee. Holding a used car costs about{' '}
        {(DAILY_DEPRECIATION * 100).toFixed(1)}% of its value a day.
      </p>
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
          <p className="muted cal-intro">
            The sheet&apos;s grade leans kind: about one car in five comes in a step worse. An
            inspection ({formatMoney(INSPECT_FEE)}, any day the list is up until the lot runs) reads
            it closer and tightens the estimate.
          </p>
          <ManagerNote />
          <Wholesale day={day} />
        </>
      )}
    </>
  )
}
