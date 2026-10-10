import { formatTime } from '../sim/clock'
import { SHOP_HOURS, specialOf } from '../sim/nazma'
import type { SabotageRecord } from '../sim/sabotage'
import { useGame } from '../state/store'

/** Jaguar's lifetime record, one row per tally. */
const RECORD: [keyof SabotageRecord, string][] = [
  ['visits', 'Visits'],
  ['runOffByYou', 'Run off by you'],
  ['runOffByGuard', 'Run off by your guard'],
  ['smudged', 'Cars smudged'],
  ['stolen', 'Cars stolen'],
  ['poached', 'Staff poached'],
  ['kept', 'Staff kept with a raise'],
]

/**
 * Nazma's cupcake shop across the road: its hours, today's special, and
 * Jaguar's track record from the saved `sabotage` tallies (up to last night).
 */
export function NazmasTab() {
  const day = useGame((s) => s.clock.day)
  const record = useGame((s) => s.sabotage)
  const special = specialOf(day)
  const harm = record.smudged + record.stolen + record.poached
  return (
    <>
      <h2>Nazma&apos;s</h2>
      <dl className="stock-summary">
        <dt>Shop</dt>
        <dd>Cupcakes and coffee, across the road</dd>
        <dt>Hours</dt>
        <dd>
          {formatTime(SHOP_HOURS.open)}–{formatTime(SHOP_HOURS.close)}, every day
        </dd>
      </dl>
      <p className="muted">
        Nazma bakes every morning and pops over now and then to say hello. He&apos;s a good
        neighbour; his coworker Jaguar is not.
      </p>
      <h3>Today&apos;s special</h3>
      <p>
        <b>{special.name}</b> <span className="muted">· {special.note}</span>
      </p>
      <h3>Jaguar&apos;s record</h3>
      {record.visits === 0 && record.stolen === 0 ? (
        <p className="muted">Jaguar hasn&apos;t been over yet.</p>
      ) : (
        <>
          <dl className="stock-summary">
            {RECORD.map(([key, label]) => (
              <Row key={key} label={label} value={record[key]} />
            ))}
          </dl>
          <p className="muted">
            {harm === 0 ? 'He hasn’t got away with anything yet. ' : ''}Counted up to last
            night&apos;s close.
          </p>
        </>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}
