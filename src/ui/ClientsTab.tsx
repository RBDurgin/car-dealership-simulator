import { useMemo, useState } from 'react'
import {
  bookSummary,
  CLIENT_FILTERS,
  clientCarText,
  clientStatusText,
  filterClients,
  HAPPY,
  isDue,
  LAPSE_DAYS,
  LOYALTY_DISCOUNTS,
  LOYALTY_RETURN,
  PROSPECT_DAYS,
  reasonText,
  satisfactionFace,
  UNHAPPY,
  type Client,
  type ClientFilter,
} from '../sim/clients'
import { callList, type CallKind } from '../sim/calls'
import { formatTime } from '../sim/clock'
import { carName } from '../sim/interactables'
import { useGame } from '../state/store'

/** Rows shown before **More**: a full book is 200. */
const PAGE = 50

/** A face and a score, coloured by how happy they are. */
export function SatisfactionChip({ score }: { score: number }) {
  const mood = score >= HAPPY ? 'happy' : score >= UNHAPPY ? 'ok' : 'unhappy'
  return (
    <span className={`client-score client-score-${mood}`} title="Satisfaction, out of 100">
      {satisfactionFace(score)} {score}
    </span>
  )
}

/** "Called today", "Called 3 days ago", or nothing before their first call. */
function callText(c: Client, day: number): string | null {
  if (c.lastCall === null) return null
  const ago = day - c.lastCall
  return ago <= 0 ? 'Called today' : ago === 1 ? 'Called yesterday' : `Called ${ago} days ago`
}

/** What a call to them would be, for the Call button's tooltip. */
const CALL_TITLES: Record<CallKind, string> = {
  thanks: 'Thank them for buying',
  beBack: 'Call them back about the car',
  tradeUp: 'Invite them in to trade up',
  checkIn: 'Check in on how they’re doing',
}

/** "Appointment today at 10:30 AM", "Appointment tomorrow at 2:00 PM". */
function appointmentText(c: Client, day: number): string | null {
  const a = c.appointment
  if (!a || a.day < day) return null
  const when = a.day === day ? 'today' : a.day === day + 1 ? 'tomorrow' : `on day ${a.day}`
  return `Appointment ${when} at ${formatTime(a.minute)}`
}

/** One person in the book: who, how happy, their car or what they were after, and where they stand. */
function ClientRow({
  c,
  day,
  rival,
  call,
}: {
  c: Client
  day: number
  rival: string
  /** What a call to them now would be, or null if they're not one to call. */
  call: CallKind | null
}) {
  const reasons = c.reasons.map(reasonText).join(', ')
  const called = callText(c, day)
  const appointment = appointmentText(c, day)
  const due = isDue(c, day)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name client-name">
          {c.name}
          <SatisfactionChip score={c.satisfaction} />
          <span className={due ? 'stock-badge client-due' : 'stock-badge'}>
            {clientStatusText(c, day, rival)}
          </span>
        </div>
        <div className="staff-meta">{clientCarText(c, day, carName)}</div>
        {appointment && <div className="staff-meta client-appointment">{appointment}</div>}
        {(reasons || called) && (
          <div className="staff-meta muted">
            {reasons && `Last visit: ${reasons}`}
            {reasons && called && ' · '}
            {called}
          </div>
        )}
      </div>
      <div className="stock-actions">
        <button
          className="btn btn-small"
          disabled={!call}
          title={call ? CALL_TITLES[call] : 'Not one to call right now'}
          onClick={() => useGame.getState().phoneClient(c.id)}
        >
          Call
        </button>
      </div>
    </li>
  )
}

const EMPTY: Record<ClientFilter, string> = {
  all: `Nobody yet. Everyone who buys goes in the book, and so does a shopper who talked to you or your staff but didn’t buy, for ${PROSPECT_DAYS} days.`,
  due: 'Nobody is due to trade up this week.',
  prospects: 'No prospects: nobody who talked to you has left without buying lately.',
  unhappy: 'Nobody is unhappy. Keep it that way.',
}

/**
 * The client book: everyone who bought from us and the shoppers who left
 * without buying, with how happy their visits left them and when they're due
 * back. Filtered to all, due, prospects or unhappy.
 */
export function ClientsTab() {
  const clients = useGame((s) => s.clients)
  const day = useGame((s) => s.clock.day)
  const rival = useGame((s) => s.rival.name)
  const customers = useGame((s) => s.customers)
  const tried = useGame((s) => s.callsTried)
  const receptionCalls = useGame((s) => s.clientPerks.receptionCalls)
  const loyalty = useGame((s) => s.clientPerks.loyaltyDiscount)
  const receptionist = useGame((s) => s.roster.some((e) => e.role === 'receptionist' && !e.fired))
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const rows = useMemo(() => filterClients(clients, filter, day), [clients, filter, day])
  const summary = useMemo(() => bookSummary(clients), [clients])
  // Who can be called now, and what about: not anyone on the lot or tried today.
  const calls = useMemo(() => {
    const skip = new Set(tried)
    for (const c of customers) if (c.clientId) skip.add(c.clientId)
    return new Map(callList(clients, day, skip).map((e) => [e.client.id, e.kind]))
  }, [clients, customers, tried, day])
  const pick = (f: ClientFilter) => {
    setFilter(f)
    setShown(PAGE)
  }
  return (
    <>
      <h2>Clients</h2>
      <dl className="stock-summary">
        <dt>In the book</dt>
        <dd>
          {summary.clients} client{summary.clients === 1 ? '' : 's'}, {summary.prospects} prospect
          {summary.prospects === 1 ? '' : 's'}
        </dd>
        <dt>Satisfaction</dt>
        <dd>
          {summary.satisfaction === null ? (
            <span className="muted">No visits yet</span>
          ) : (
            <>
              <SatisfactionChip score={summary.satisfaction} />{' '}
              <span className="muted">on average</span>
            </>
          )}
        </dd>
      </dl>
      <label className="service-auto">
        <input
          type="checkbox"
          checked={receptionCalls}
          onChange={(e) => useGame.getState().setReceptionCalls(e.target.checked)}
        />{' '}
        Receptionist calls clients when nobody is waiting
        {!receptionist && <span className="muted"> (hire one from the staff panel)</span>}
      </label>
      <h3>Loyalty discount</h3>
      <div className="service-rates" role="radiogroup" aria-label="Loyalty discount">
        {LOYALTY_DISCOUNTS.map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={loyalty === d}
            className={loyalty === d ? 'btn btn-small btn-primary' : 'btn btn-small'}
            onClick={() => useGame.getState().setLoyaltyDiscount(d)}
          >
            {d === 0 ? 'None' : `${Math.round(d * 100)}% off`}
          </button>
        ))}
      </div>
      <p className="muted">
        {loyalty === 0
          ? 'Returning clients are priced at the sticker.'
          : `Returning clients are priced ${Math.round(loyalty * 100)}% under the sticker: every sale to them earns less, but they come back to trade up ${Math.round((LOYALTY_RETURN[loyalty] - 1) * 100)}% more often and leave happier.`}
      </p>
      <h3>Book</h3>
      <div className="service-rates" role="radiogroup" aria-label="Show">
        {CLIENT_FILTERS.map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={filter === id}
            className={filter === id ? 'btn btn-small btn-primary' : 'btn btn-small'}
            onClick={() => pick(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted staff-empty">{EMPTY[filter]}</p>
      ) : (
        <ul className="staff-list">
          {rows.slice(0, shown).map((c) => (
            <ClientRow key={c.id} c={c} day={day} rival={rival} call={calls.get(c.id) ?? null} />
          ))}
        </ul>
      )}
      {rows.length > shown && (
        <button className="btn btn-small" onClick={() => setShown(shown + PAGE)}>
          More ({rows.length - shown})
        </button>
      )}
      <p className="muted">
        Call from the desk phone in the office: thank recent buyers, call prospects back, invite
        clients due to trade up and check on unhappy ones. A call can book an appointment for
        tomorrow. A client due to trade up may also come in on their own, the likelier the happier
        they are, and drives in with the car you sold them to trade. Not back within {LAPSE_DAYS}{' '}
        days of being due, they buy elsewhere. Each visit is scored on the wait, the haggling, the
        price against what they hoped to pay, how clean the car was and the trade-in, and blended
        into how happy they are with you. A star over a waiting customer means they’re in the book.
      </p>
    </>
  )
}
