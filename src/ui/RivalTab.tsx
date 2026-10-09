import { longDate, weekdayLabel, calendarOf } from '../sim/calendar'
import { CAR_MODELS } from '../sim/customers'
import { carName } from '../sim/interactables'
import { BASE_MSRP } from '../sim/inventory'
import { rankById } from '../sim/progression'
import {
  activeMove,
  BUST_SHARE,
  BUST_WEEKS,
  desperation,
  MAX_SHARE,
  MOVE_LABELS,
  moveText,
  OPENING_RANK,
  RIVAL_STATUS_LABELS,
  rivalPrice,
  shareLine,
  undercutOf,
  weekChange,
  type Rival,
} from '../sim/rival'
import { useGame } from '../state/store'
import { formatMoney } from './format'

const percent = (share: number) => `${Math.round(share * 100)}%`

/** His share on each of the last few days he was open, as bars against `MAX_SHARE`, the latest last. */
function ShareSparkline({ shares, today }: { shares: readonly number[]; today: number }) {
  const days = shares.length
  const first = today - days
  return (
    <ul className="rival-spark" aria-label="His share each day">
      {shares.map((share, i) => (
        <li key={i} title={`${weekdayLabel(calendarOf(first + i).weekday)}: ${percent(share)}`}>
          <span className="rival-spark-bar" style={{ height: `${(share / MAX_SHARE) * 100}%` }} />
          <span className="rival-spark-day">{weekdayLabel(calendarOf(first + i).weekday)[0]}</span>
        </li>
      ))}
    </ul>
  )
}

/** His sticker against his price on each model. */
function PriceList({ rival }: { rival: Rival }) {
  return (
    <ul className="rival-prices">
      {CAR_MODELS.map((model) => (
        <li key={model}>
          <span>{carName(model)}</span>
          <span className="muted price">{formatMoney(BASE_MSRP[model])}</span>
          <b className="price">{formatMoney(rivalPrice(rival, BASE_MSRP[model]))}</b>
        </li>
      ))}
    </ul>
  )
}

/** How he stands while open: today's share, the last days' and weeks', his strength and prices. */
function OpenRival({ rival }: { rival: Rival }) {
  const day = useGame((s) => s.clock.day)
  const share = useGame((s) => s.dayStats.rival?.share ?? 0)
  const lastWeek = rival.weeks[rival.weeks.length - 1]
  const move = activeMove(rival)
  const desperate = desperation(rival) >= 0.5
  return (
    <>
      <dl className="stock-summary">
        <dt>Today</dt>
        <dd>
          <b>{percent(share)}</b> of the town&apos;s buyers go to him
        </dd>
        <dt>Last week</dt>
        <dd>
          {lastWeek === undefined ? (
            <span className="muted">No report until Monday</span>
          ) : (
            shareLine(lastWeek, weekChange(rival.weeks))
          )}
        </dd>
        <dt>This week</dt>
        <dd>
          {move ? (
            <>
              <b>{MOVE_LABELS[move]}</b> <span className="muted">· {moveText(rival)}</span>
            </>
          ) : (
            <span className="muted">No move until Monday</span>
          )}
        </dd>
        <dt>Strength</dt>
        <dd className="rival-strength">
          <span className="cal-bar" aria-hidden>
            <span className="cal-fill" style={{ width: `${rival.strength}%` }} />
          </span>
          <span>{Math.round(rival.strength)}/100</span>
        </dd>
      </dl>
      {rival.shares.length > 0 && (
        <>
          <h3>
            His share <span className="muted">· the last {rival.shares.length} days</span>
          </h3>
          <ShareSparkline shares={rival.shares} today={day} />
        </>
      )}
      <h3>
        His prices <span className="muted">· {percent(undercutOf(rival))} under MSRP</span>
      </h3>
      <PriceList rival={rival} />
      {rival.hires.length > 0 && (
        <p className="muted cal-intro">Working for him: {rival.hires.join(', ')}.</p>
      )}
      {rival.stolen.length > 0 && (
        <p className="muted cal-intro">
          For sale on his lot, taken from yours: {rival.stolen.map(carName).join(', ')}.
        </p>
      )}
      {desperate && (
        <p className="cal-intro">
          His lot is struggling and Nazma is getting desperate: expect him to visit, steal and poach
          more often.
        </p>
      )}
      <p className="muted cal-intro">
        His share grows with his strength and with how far he undercuts your prices. Your reputation
        and the ads you run pull it back down. He gets stronger while he takes more than a few of
        the town&apos;s buyers, and weaker while he doesn&apos;t. Each Monday he picks a move for
        the week: a price war, an ad blitz against yours, a sale weekend or a quiet week. Keep his
        weekly share under {percent(BUST_SHARE)} for {BUST_WEEKS} weeks running and he goes bust.
      </p>
    </>
  )
}

/**
 * Nazma's lot across the road: what's there (nothing, a building site, an open
 * lot), and once he's open, his share of the town's buyers and his prices.
 */
export function RivalTab() {
  const rival = useGame((s) => s.rival)
  const beaten = useGame((s) => s.career.rivalsBeaten)
  return (
    <>
      <h2>
        {rival.status === 'unopened' ? 'Across the road' : rival.name}{' '}
        <span className="muted">· {RIVAL_STATUS_LABELS[rival.status]}</span>
      </h2>
      {rival.status === 'unopened' ? (
        <p className="muted cal-intro">
          The lot across the road is empty for now. Nazma has his eye on it: once you reach{' '}
          {rankById(OPENING_RANK).name}, expect him to open a dealership of his own there.
        </p>
      ) : rival.status === 'announced' ? (
        <p className="muted cal-intro">
          Nazma is building a dealership across the road. {rival.name} opens on{' '}
          {longDate(rival.openDay)}, a little under your prices. Build up your reputation and plan
          some ads before then.
        </p>
      ) : rival.status === 'closed' ? (
        <p className="muted cal-intro">
          {rival.name} has gone bust and is boarded up. Nazma won&apos;t trouble you while it&apos;s
          shut, but he&apos;ll be back in a few weeks under a new name, a little stronger.
        </p>
      ) : (
        <OpenRival rival={rival} />
      )}
      {beaten > 0 && (
        <p className="cal-intro">
          Rivals beaten: <b>{beaten}</b>
        </p>
      )}
    </>
  )
}
