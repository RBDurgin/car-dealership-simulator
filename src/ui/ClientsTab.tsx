import { useMemo, useState } from 'react'
import {
  bookSummary,
  CLIENT_FILTERS,
  clientCarText,
  clientStatusText,
  filterClients,
  HAPPY,
  isDue,
  PROSPECT_DAYS,
  reasonText,
  satisfactionFace,
  UNHAPPY,
  type Client,
  type ClientFilter,
} from '../sim/clients'
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

/** One person in the book: who, how happy, their car or what they were after, and where they stand. */
function ClientRow({ c, day, rival }: { c: Client; day: number; rival: string }) {
  const reasons = c.reasons.map(reasonText).join(', ')
  const called = callText(c, day)
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
        {(reasons || called) && (
          <div className="staff-meta muted">
            {reasons && `Last visit: ${reasons}`}
            {reasons && called && ' · '}
            {called}
          </div>
        )}
      </div>
      <div className="stock-actions">
        <button className="btn btn-small" disabled title="Calling clients isn’t available yet">
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
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const rows = useMemo(() => filterClients(clients, filter, day), [clients, filter, day])
  const summary = useMemo(() => bookSummary(clients), [clients])
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
            <ClientRow key={c.id} c={c} day={day} rival={rival} />
          ))}
        </ul>
      )}
      {rows.length > shown && (
        <button className="btn btn-small" onClick={() => setShown(shown + PAGE)}>
          More ({rows.length - shown})
        </button>
      )}
      <p className="muted">
        Each visit is scored on the wait, the haggling, the price against what they hoped to pay,
        how clean the car was and the trade-in, and blended into how happy they are with you. A star
        over a waiting customer means they’re in the book.
      </p>
    </>
  )
}
