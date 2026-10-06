import type { ReactNode } from 'react'
import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import {
  canHire,
  MAX_SKILL,
  retentionRaise,
  ROLE_BLURBS,
  ROLE_LABELS,
  type Employee,
  type StaffStatus,
} from '../sim/staff'
import { useGame } from '../state/store'
import { formatMoney } from './format'

const STATUS_LABELS: Record<StaffStatus, string> = {
  off: 'Off shift',
  arriving: 'On the way in',
  atPost: 'At work',
  leaving: 'Heading home',
}

export function Skill({ skill }: { skill: number }) {
  return (
    <span className="skill" aria-label={`Skill ${skill} of ${MAX_SKILL}`}>
      {'★'.repeat(skill)}
      <span className="muted">{'★'.repeat(MAX_SKILL - skill)}</span>
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
        <div className="staff-name">{e.name}</div>
        <div className="staff-meta">
          {ROLE_LABELS[e.role]} · <Skill skill={e.skill} />
        </div>
        {blurb && <div className="staff-blurb muted">{ROLE_BLURBS[e.role]}</div>}
      </div>
      <div className="staff-wage price">{formatMoney(e.wage)}/day</div>
      {children}
    </li>
  )
}

/**
 * Hiring and firing: who's on the payroll, and today's applicants. Toggled from
 * the top bar or with H. Wages are paid at closing.
 */
export function StaffPanel() {
  const open = useGame((s) => s.staffOpen)
  const roster = useGame((s) => s.roster)
  const candidates = useGame((s) => s.candidates)
  const touch = useMediaQuery(COARSE)
  if (!open) return null

  const game = useGame.getState()
  const employed = roster.filter((e) => !e.fired)
  return (
    <div className="panel staff-panel" role="dialog" aria-label="Staff">
      <button className="close" aria-label="Close" onClick={() => game.toggleStaffPanel(false)}>
        ×
      </button>
      <div className="info-kicker">Staff</div>
      <h2>Your team</h2>
      {employed.length === 0 ? (
        <p className="muted staff-empty">Nobody yet. You're running the place alone.</p>
      ) : (
        <ul className="staff-list">
          {employed.map((e) => (
            <StaffRow key={e.id} e={e}>
              {e.quitting ? (
                <span className="staff-status staff-quitting">Thinking of quitting</span>
              ) : (
                <span className="staff-status muted">{STATUS_LABELS[e.status]}</span>
              )}
              <div className="staff-actions">
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
            const blocker = canHire(roster, c.role)
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
        Wages are paid at closing.{touch ? '' : ' H or Esc to close.'}
      </div>
    </div>
  )
}
