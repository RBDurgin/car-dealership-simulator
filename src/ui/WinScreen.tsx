import { useMemo } from 'react'
import { bookSummary } from '../sim/clients'
import { difficultyLabel } from '../sim/difficulty'
import { tierName } from '../sim/franchise'
import { bestMonthSoFar, TOP_RANK } from '../sim/progression'
import { useGame, winShowing } from '../state/store'
import { formatMoney } from './format'

/**
 * Dealer of the Year: shown over the day summary once the top rank is
 * reached. Keep playing closes it for good, and the game goes on.
 */
export function WinScreen() {
  const open = useGame(winShowing)
  return open ? <WinPanel /> : null
}

/** The open screen; only it selects the career and the book. */
function WinPanel() {
  const career = useGame((s) => s.career)
  const franchise = useGame((s) => s.franchise)
  const difficulty = useGame((s) => s.difficulty)
  const dealershipName = useGame((s) => s.dealershipName)
  const rivalOpened = useGame((s) => s.rival.generation > 0)
  const clients = useGame((s) => s.clients)
  const book = useMemo(() => bookSummary(clients), [clients])

  return (
    <div className="modal-backdrop">
      <div className="panel day-summary win-screen" role="dialog" aria-label={TOP_RANK.name}>
        <div className="win-trophy" aria-hidden="true">
          🏆
        </div>
        <div className="info-kicker">
          {dealershipName} · {difficultyLabel(difficulty)}
        </div>
        <h2>{TOP_RANK.name}!</h2>
        <p>
          The whole region knows your name. You built {dealershipName} from a corner lot into the
          best dealership around.
        </p>
        <dl className="summary-stats">
          <dt>Days played</dt>
          <dd>{career.days}</dd>
          <dt>Cars sold</dt>
          <dd>{career.sales}</dd>
          <dt>Lifetime gross</dt>
          <dd className="price">{formatMoney(career.gross)}</dd>
          <dt>Best month</dt>
          <dd className="price">{formatMoney(bestMonthSoFar(career))}</dd>
          <dt>Franchise</dt>
          <dd>{tierName(franchise)}</dd>
          <dt>Client book</dt>
          <dd>
            {book.clients} client{book.clients === 1 ? '' : 's'}
            {book.satisfaction !== null && (
              <span className="muted">, satisfaction {book.satisfaction}</span>
            )}
          </dd>
          {career.bestCsi !== null && (
            <>
              <dt>Best month&apos;s CSI</dt>
              <dd>{career.bestCsi}</dd>
            </>
          )}
          {rivalOpened && (
            <>
              <dt>Rivals beaten</dt>
              <dd>{career.rivalsBeaten}</dd>
            </>
          )}
        </dl>
        <p className="muted">
          The game goes on: keep growing and chase a better month. Your save will carry a trophy.
        </p>
        <button
          className="btn btn-primary"
          autoFocus
          onClick={() => useGame.getState().keepPlaying()}
        >
          Keep playing
        </button>
      </div>
    </div>
  )
}
