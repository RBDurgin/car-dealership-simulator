import { calendarOf, longDate, monthLabel, shortDate } from '../sim/calendar'
import { ceilingOf, hiredSkill, levelProgress, SENIOR_PERKS, titleOf } from '../sim/growth'
import { moraleFace, moraleLabel, moraleLines } from '../sim/morale'
import { ROLE_BLURBS } from '../sim/staff'
import { emptyEmployeeTotal, ROLE_TOTALS, type EmployeeTotal } from '../sim/stats'
import { useGame } from '../state/store'
import { formatMoney } from './format'
import { Skill } from './StaffPanel'

const TOTAL_LABELS: Record<keyof EmployeeTotal, string> = {
  days: 'Days worked',
  xp: 'Experience earned',
  sales: 'Cars sold',
  gross: 'Gross on them',
  signings: 'Deals signed',
  drives: 'Test drives',
  washes: 'Cars washed',
  jobs: 'Jobs finished',
  checkIns: 'Clients checked in',
  findings: 'Extra work sold',
  calls: 'Calls made',
  bookings: 'Appointments booked',
  chases: 'Times Nazma was run off',
}

/** "March", with the year from year 2 on. */
function monthOf(day: number): string {
  const c = calendarOf(day)
  return `${monthLabel(c.month, true)}${c.year > 1 ? `, year ${c.year}` : ''}`
}

/**
 * One employee's page, over the panels: when they were hired, their skill
 * and how it grew, their morale and why, their lifetime totals for the role,
 * and their titles. Opened from the Staff panel or the Stats tab.
 */
export function EmployeePage() {
  const id = useGame((s) => s.employeePage)
  return id ? <EmployeeBody id={id} /> : null
}

function EmployeeBody({ id }: { id: string }) {
  const e = useGame((s) => s.roster.find((x) => x.id === id))
  const total = useGame((s) => s.lifetime.byEmployee[id])
  const wins = useGame((s) => s.eotm)
  // Esc closes it through the store's `cancelAll`, before the panel underneath.
  const close = () => useGame.getState().openEmployeePage(null)

  // Let go and gone from the roster: nothing left to show.
  if (!e) return null
  const t = total ?? emptyEmployeeTotal()
  const starts = hiredSkill(e)
  const theirs = wins.filter((w) => w.id === id)
  const why = moraleLines(e.moraleWhy)
  const growing = e.skill < ceilingOf(e)
  const rows: (keyof EmployeeTotal)[] = ['days', 'xp', ...ROLE_TOTALS[e.role]]

  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div
        className="panel day-summary employee-page"
        role="dialog"
        aria-label={e.name}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        <button className="close" aria-label="Close" onClick={close}>
          ×
        </button>
        <div className="info-kicker">
          {e.senior && <span aria-hidden>★ </span>}
          {titleOf(e)}
        </div>
        <h2>{e.name}</h2>
        <p className="muted employee-blurb">{ROLE_BLURBS[e.role]}</p>

        <dl className="summary-stats">
          <dt>Hired</dt>
          <dd>
            {longDate(e.hiredDay)}
            <span className="muted"> at skill {starts}</span>
          </dd>
          <dt>Wage</dt>
          <dd className="price">{formatMoney(e.wage)}/day</dd>
          <dt>Skill</dt>
          <dd>
            <Skill skill={e.skill} potential={e.potential} />
            {growing && (
              <span className="muted">
                {' '}
                · {Math.round(levelProgress(e) * 100)}% to {e.skill + 1}
              </span>
            )}
          </dd>
          <dt>Morale</dt>
          <dd>
            {moraleFace(e.morale)} {moraleLabel(e.morale)}
          </dd>
        </dl>
        {why.length > 0 && (
          <ul className="mood-why employee-why" aria-label="What moved their morale last night">
            {why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <h3>Levels</h3>
        {e.levels.length === 0 ? (
          <p className="muted employee-empty">No level-ups yet.</p>
        ) : (
          <ul className="summary-bought employee-levels">
            {e.levels.map((l) => (
              <li key={l.skill}>
                Skill {l.skill} <span className="muted">· {shortDate(l.day)}</span>
              </li>
            ))}
          </ul>
        )}

        <h3>Their record</h3>
        <dl className="summary-stats">
          {rows.flatMap((k) => [
            <dt key={`${k}-t`}>{TOTAL_LABELS[k]}</dt>,
            <dd key={`${k}-d`} className={k === 'gross' ? 'price' : undefined}>
              {k === 'gross' ? formatMoney(t[k]) : Math.round(t[k])}
            </dd>,
          ])}
        </dl>

        {(e.senior || theirs.length > 0 || e.trained) && <h3>Honours</h3>}
        <ul className="summary-bought employee-honours">
          {e.senior && (
            <li>
              ★ {titleOf(e)}: {SENIOR_PERKS[e.role].text.toLowerCase()}
            </li>
          )}
          {theirs.map((w) => (
            <li key={w.day}>🏆 Employee of the Month, {monthOf(w.day)}</li>
          ))}
          {e.trained && <li>📚 Took the advanced course</li>}
        </ul>
        <div className="status-hint">Totals count every day closed since they were hired.</div>
      </div>
    </div>
  )
}
