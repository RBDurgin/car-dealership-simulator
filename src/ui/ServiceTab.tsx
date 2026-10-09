import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { formatTime } from '../sim/clock'
import { serviceGross } from '../sim/deal'
import { EXPANSIONS, expansionsUp } from '../sim/expansions'
import { carName } from '../sim/interactables'
import type { InventoryCar } from '../sim/inventory'
import { rankById } from '../sim/progression'
import {
  bayCount,
  GARAGE_EXPANSION,
  JOBS,
  minutesLeft,
  RECON_MAX,
  reconBlocker,
  reconGain,
  type ServiceJob,
} from '../sim/service'
import { mechanicWorking } from '../sim/staffAi'
import { shapeLabel, usedTag } from '../sim/usedCars'
import { reconBook, useGame } from '../state/store'
import { formatMoney } from './format'

const { parts: RECON_PARTS } = JOBS.recon

/** What's in bay `bay`: the car, who's on it and when it'll be done. */
function BayRow({ bay, job }: { bay: number; job: ServiceJob | undefined }) {
  const inventory = useGame((s) => s.inventory)
  const roster = useGame((s) => s.roster)
  const minute = useGame((s) => s.clock.minute)
  const car = job?.carId ? inventory.find((c) => c.id === job.carId) : undefined
  const mechanic = roster.find((e) => e.id === job?.mechanicId)
  const working = !!job && mechanicWorking(roster, job.mechanicId)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          Bay {bay + 1}
          {job && <span className="stock-badge">{JOBS[job.kind].label}</span>}
        </div>
        <div className="staff-meta">
          {!job
            ? 'Empty'
            : `${car ? carName(car.model) : 'A car'} · ${
                working
                  ? `${mechanic!.name}, ready about ${formatTime(minute + minutesLeft(job))}`
                  : 'Stalled: nobody is working on it'
              }`}
        </div>
      </div>
    </li>
  )
}

/** A used car that could go to the shop: what it's worth doing against what the parts cost. */
function ReconRow({ car, day }: { car: InventoryCar; day: number }) {
  const touch = useMediaQuery(COARSE)
  const blocker = useGame((s) => reconBlocker(reconBook(s), car.id))
  const gain = reconGain(car, day)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {carName(car.model)}
          <span className="stock-badge stock-used">{usedTag(car.used!)}</span>
        </div>
        <div className="staff-meta">
          {shapeLabel(car.used!.condition)} · worth about {formatMoney(gain)} more done up
        </div>
      </div>
      <div className="staff-wage price" title="What the parts cost">
        {formatMoney(RECON_PARTS.min)}–{formatMoney(RECON_PARTS.max)}
      </div>
      <div className="stock-actions">
        <button
          className="btn btn-small btn-primary"
          disabled={!!blocker}
          title={blocker ?? 'Pay for the parts now; a mechanic does the work'}
          onClick={() => useGame.getState().recondition(car.id)}
        >
          Recondition
        </button>
      </div>
      {touch && blocker && <div className="stock-why muted">{blocker}</div>}
    </li>
  )
}

/** Before the garage is up: what it takes to build one. */
function NoGarage({ bought }: { bought: boolean }) {
  const info = EXPANSIONS[GARAGE_EXPANSION]
  return (
    <>
      <h2>Service</h2>
      <p className="muted">
        {bought
          ? 'Your service garage is built tonight. Hire mechanics from the staff panel once it’s up.'
          : `Build a service garage on the Upgrades tab (${formatMoney(info.cost)}, needs ${rankById(info.rank).name} and the east lot). Its mechanics recondition used cars, so they sell for more.`}
      </p>
      {!bought && (
        <button
          className="btn btn-small"
          onClick={() => useGame.getState().toggleStockPanel(true, 'upgrades')}
        >
          Upgrades
        </button>
      )}
    </>
  )
}

/**
 * The service garage: what's in each bay and when it'll be done, the used cars
 * worth reconditioning, and today's service income.
 */
export function ServiceTab() {
  const bays = useGame((s) => bayCount(expansionsUp(s)))
  const bought = useGame((s) => s.expansions.some((o) => o.id === GARAGE_EXPANSION))
  const jobs = useGame((s) => s.serviceJobs)
  const inventory = useGame((s) => s.inventory)
  const day = useGame((s) => s.clock.day)
  const mechanics = useGame((s) => s.roster.filter((e) => e.role === 'mechanic' && !e.fired).length)
  const autoRecon = useGame((s) => s.service.autoRecon)
  const stats = useGame((s) => s.dayStats)
  if (bays === 0) return <NoGarage bought={bought} />
  const waiting = jobs.filter((j) => j.status === 'waiting')
  const candidates = inventory
    .filter((c) => c.status === 'available' && c.used && c.used.condition < RECON_MAX)
    .sort((a, b) => reconGain(b, day) - reconGain(a, day))
  const queued = (j: ServiceJob) => {
    const car = inventory.find((c) => c.id === j.carId)
    return car ? carName(car.model) : JOBS[j.kind].label
  }
  return (
    <>
      <h2>Service garage</h2>
      {mechanics === 0 && (
        <p className="stock-full">No mechanics: hire one for each bay from the staff panel.</p>
      )}
      <ul className="staff-list">
        {Array.from({ length: bays }, (_, bay) => (
          <BayRow
            key={bay}
            bay={bay}
            job={jobs.find((j) => j.status === 'inBay' && j.bay === bay)}
          />
        ))}
      </ul>
      {waiting.length > 0 && (
        <p className="muted">Waiting for a bay: {waiting.map(queued).join(', ')}.</p>
      )}
      <h3>Reconditioning</h3>
      <p className="muted">
        A mechanic raises a used car’s condition and details it. It goes back on sale at what it’s
        worth now, and the parts go on its cost.
      </p>
      <label className="service-auto">
        <input
          type="checkbox"
          checked={autoRecon}
          onChange={(e) => useGame.getState().setAutoRecon(e.target.checked)}
        />{' '}
        Send used cars to the shop the morning after you take them in
      </label>
      {candidates.length === 0 ? (
        <p className="muted staff-empty">No used car in stock needs it.</p>
      ) : (
        <ul className="staff-list">
          {candidates.map((car) => (
            <ReconRow key={car.id} car={car} day={day} />
          ))}
        </ul>
      )}
      <h3>Today</h3>
      <dl className="stock-summary">
        <dt>Reconditioned</dt>
        <dd>{stats.service.recon}</dd>
        <dt>Service income</dt>
        <dd className="price">{formatMoney(serviceGross(stats))}</dd>
      </dl>
      <p className="muted">
        Anything still in a bay at closing is finished in overtime. Cars waiting for a bay go back
        on sale, with their parts money back.
      </p>
    </>
  )
}
