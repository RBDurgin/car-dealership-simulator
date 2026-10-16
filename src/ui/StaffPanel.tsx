import { useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import {
  canHire,
  MAX_SKILL,
  retentionRaise,
  ROLE_BADGES,
  ROLE_BLURBS,
  ROLE_LABELS,
  type Employee,
  type StaffStatus,
} from '../sim/staff'
import { ceilingOf, levelProgress } from '../sim/growth'
import {
  isWarned,
  moraleFace,
  moraleLabel,
  moraleLines,
  tiredDays,
  FATIGUE_DAYS,
} from '../sim/morale'
import { calendarOf, weekdayLabel } from '../sim/calendar'
import { coverageGaps, FULL_DAYS, gapText, WEEK } from '../sim/rota'
import { groundUp } from '../state/selectors'
import { useGame } from '../state/store'
import { formatMoney } from './format'

const STATUS_LABELS: Record<StaffStatus, string> = {
  off: 'Off shift',
  arriving: 'On the way in',
  atPost: 'At work',
  leaving: 'Heading home',
}

/**
 * Skill as stars out of `MAX_SKILL`; with a `potential`, the levels they
 * can still grow into are hollow.
 */
export function Skill({ skill, potential = skill }: { skill: number; potential?: number }) {
  const top = Math.max(skill, Math.min(MAX_SKILL, potential))
  const label =
    top > skill
      ? `Skill ${skill} of ${MAX_SKILL}, can grow to ${top}`
      : `Skill ${skill} of ${MAX_SKILL}`
  return (
    <span className="skill" aria-label={label} title={label}>
      {'★'.repeat(skill)}
      {'☆'.repeat(top - skill)}
      <span className="muted">{'★'.repeat(MAX_SKILL - top)}</span>
    </span>
  )
}

/** How far they are toward their next level, or nothing once they can't grow. */
function Growth({ e }: { e: Employee }) {
  if (e.skill >= ceilingOf(e)) return null
  const pct = Math.round(levelProgress(e) * 100)
  return (
    <span
      className="xp-bar"
      role="meter"
      aria-label="Experience to the next level"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      title={`${pct}% of the way to skill ${e.skill + 1}`}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}

/** A face for their morale; hover (or the info panel) for the number and why. */
export function Mood({ e }: { e: Pick<Employee, 'morale' | 'moraleWhy'> }) {
  const why = moraleLines(e.moraleWhy)
  const label = `Morale: ${moraleLabel(e.morale)}`
  return (
    <span className="mood" role="img" aria-label={label} title={[label, ...why].join('\n')}>
      {moraleFace(e.morale)}
    </span>
  )
}

function StaffRow({
  e,
  blurb = false,
  children,
}: {
  e: Employee
  /** Say what the role does, for someone not yet hired. */
  blurb?: boolean
  children: ReactNode
}) {
  return (
    <li className="staff-row">
      <div className="staff-who">
        <div className="staff-name">
          {e.name}
          {!blurb && <Mood e={e} />}
        </div>
        <div className="staff-meta">
          {ROLE_LABELS[e.role]} · <Skill skill={e.skill} potential={e.potential} />
          {!blurb && <Growth e={e} />}
        </div>
        {blurb && <div className="staff-blurb muted">{ROLE_BLURBS[e.role]}</div>}
      </div>
      <div className="staff-wage price">{formatMoney(e.wage)}/day</div>
      {children}
    </li>
  )
}

/**
 * The weekly rota: a row per employee, a cell per weekday to switch their day
 * off, the gaps it leaves and **Auto** to have the game pick again.
 */
function Schedule({ employed }: { employed: Employee[] }) {
  const day = useGame((s) => s.clock.day)
  const today = calendarOf(day).weekday
  const game = useGame.getState()
  if (employed.length === 0) {
    return <p className="muted staff-empty">Nobody to schedule yet.</p>
  }
  const gaps = coverageGaps(employed)
  return (
    <>
      <table className="rota">
        <thead>
          <tr>
            <th />
            {WEEK.map((w) => (
              <th
                key={w}
                scope="col"
                className={w === today ? 'rota-today' : undefined}
                title={`${weekdayLabel(w, true)}${FULL_DAYS.includes(w) ? ', busy' : ''}${w === today ? ', today' : ''}`}
              >
                {weekdayLabel(w).slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employed.map((e) => (
            <tr key={e.id}>
              <th scope="row">
                <div className="staff-name">{e.name}</div>
                <div className="staff-meta">
                  {ROLE_BADGES[e.role]}
                  {tiredDays(e.streak) > 0 && (
                    <span className="staff-quitting"> · {e.streak} days straight</span>
                  )}
                </div>
              </th>
              {WEEK.map((w) => {
                const off = e.daysOff.includes(w)
                return (
                  <td key={w}>
                    <button
                      className={`rota-cell${off ? ' rota-off' : ''}`}
                      aria-pressed={off}
                      aria-label={`${e.name}, ${weekdayLabel(w, true)}: ${off ? 'day off' : 'working'}`}
                      onClick={() => game.toggleDayOff(e.id, w)}
                    >
                      {off ? 'Off' : '●'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {gaps.length === 0 ? (
        <p className="muted rota-gaps">Every role is covered every day.</p>
      ) : (
        <ul className="rota-gaps staff-quitting">
          {gaps.map((g) => (
            <li key={`${g.role}-${g.weekday}`}>{gapText(g)}</li>
          ))}
        </ul>
      )}
      <div className="staff-actions">
        <button
          className="btn btn-small"
          title="Give everyone their days off afresh, keeping each role covered where it can."
          onClick={() => game.autoSchedule()}
        >
          Auto
        </button>
      </div>
    </>
  )
}

/**
 * Hiring and firing: who's on the payroll, and today's applicants, or the
 * weekly schedule. Toggled from the top bar or with H. Wages are paid at closing.
 */
export function StaffPanel() {
  const open = useGame((s) => s.staffOpen)
  return open ? <StaffList /> : null
}

/** The open panel; only it selects the roster, so a closed panel doesn't re-render as staff move. */
function StaffList() {
  const roster = useGame((s) => s.roster)
  const candidates = useGame((s) => s.candidates)
  const ground = useGame(useShallow(groundUp))
  const offToday = useGame((s) => s.dayStats.off)
  const touch = useMediaQuery(COARSE)
  const [view, setView] = useState<'team' | 'schedule'>('team')

  const game = useGame.getState()
  const employed = roster.filter((e) => !e.fired)
  return (
    <div className="panel staff-panel" role="dialog" aria-label="Staff">
      <button className="close" aria-label="Close" onClick={() => game.toggleStaffPanel(false)}>
        ×
      </button>
      <div className="info-kicker">Staff</div>
      <div className="panel-tabs" role="tablist">
        {(
          [
            ['team', 'Team'],
            ['schedule', 'Schedule'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={view === v ? 'btn btn-small btn-primary' : 'btn btn-small'}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'schedule' ? (
        <>
          <h2>Schedule</h2>
          <Schedule employed={employed} />
          <div className="status-hint">
            Click a day to give it off or take it back; changes start tomorrow. Days off aren't
            paid, and over {FATIGUE_DAYS} days in a row wears people out.
          </div>
        </>
      ) : (
        <>
          <h2>Your team</h2>
          {employed.length === 0 ? (
            <p className="muted staff-empty">Nobody yet. You're running the place alone.</p>
          ) : (
            <ul className="staff-list">
              {employed.map((e) => (
                <StaffRow key={e.id} e={e}>
                  {e.quitting ? (
                    <span className="staff-status staff-quitting">Thinking of quitting</span>
                  ) : isWarned(e) ? (
                    <span className="staff-status staff-quitting">Unhappy</span>
                  ) : e.raiseAsk ? (
                    <span className="staff-status staff-raise">
                      Asks for {formatMoney(e.raiseAsk.wage)}/day
                    </span>
                  ) : (
                    <span className="staff-status muted">
                      {offToday.includes(e.id) ? 'Day off today' : STATUS_LABELS[e.status]}
                    </span>
                  )}
                  <div className="staff-actions">
                    {e.raiseAsk && !e.quitting && (
                      <>
                        <button
                          className="btn btn-small btn-primary"
                          title="Pay the wage for their new skill."
                          onClick={() => game.answerRaise(e.id, true)}
                        >
                          Grant
                        </button>
                        <button
                          className="btn btn-small"
                          title={`Keep them on ${formatMoney(e.wage)}/day.`}
                          onClick={() => game.answerRaise(e.id, false)}
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {e.quitting && (
                      <button
                        className="btn btn-small btn-primary"
                        title="A raise to stay. Otherwise they leave at closing."
                        onClick={() => game.keepEmployee(e.id)}
                      >
                        Keep (+{formatMoney(retentionRaise(e.wage))}/day)
                      </button>
                    )}
                    <button className="btn btn-small" onClick={() => game.fire(e.id)}>
                      Fire
                    </button>
                  </div>
                </StaffRow>
              ))}
            </ul>
          )}
          <h3>Applicants today</h3>
          {candidates.length === 0 ? (
            <p className="muted staff-empty">No more applicants today.</p>
          ) : (
            <ul className="staff-list">
              {candidates.map((c) => {
                const blocker = canHire(roster, c.role, ground)
                return (
                  <StaffRow key={c.id} e={c} blurb>
                    <span />
                    <button
                      className="btn btn-small btn-primary"
                      disabled={!!blocker}
                      title={blocker ?? undefined}
                      onClick={() => game.hire(c.id)}
                    >
                      Hire
                    </button>
                  </StaffRow>
                )
              })}
            </ul>
          )}
          <div className="status-hint">
            Wages are paid at closing. Hollow stars are skill they can grow into; hover a face for
            their morale.
            {touch ? '' : ' H or Esc to close.'}
          </div>
        </>
      )}
    </div>
  )
}
