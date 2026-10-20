import {
  AUCTION_RANK,
  auctionOpen,
  BUYER_FEE,
  isAuctionDay,
  lotEstimate,
  nextAuction,
  type Lot,
} from '../sim/auction'
import { longDate } from '../sim/calendar'
import { carName } from '../sim/interactables'
import { rankById } from '../sim/progression'
import { lotRoom, runListFor } from '../state/selectors'
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
      <span className="muted">{Math.round(lot.car.miles / 1000)}k mi</span>
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
      {!room && <p className="cal-intro">No room on the lot: a car won needs a free lot space.</p>}
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
          <p className="cal-intro">
            {isAuctionDay(day) ? (
              <b>The auction is today.</b>
            ) : (
              <>
                The next auction is {untilText(next - day)}: <b>{longDate(next)}</b>.
              </>
            )}
          </p>
          {next - day <= 2 ? (
            <RunList day={day} />
          ) : (
            <p className="muted cal-intro">Its run list is posted on the Monday before.</p>
          )}
          <p className="muted cal-intro">
            The trade pays a little under what a used car would fetch on your lot, since it still
            has to be sold. A car you win costs the price plus the buyer fee (
            {formatMoney(BUYER_FEE.flat)} and {Math.round(BUYER_FEE.share * 100)}% of the price), is
            paid in cash, needs a free lot space and is on the lot the next morning.
          </p>
        </>
      )}
    </>
  )
}
