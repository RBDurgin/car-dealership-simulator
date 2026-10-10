import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { formatTime } from '../sim/clock'
import { serviceGross } from '../sim/deal'
import { EXPANSIONS, expansionsUp } from '../sim/expansions'
import { carName } from '../sim/interactables'
import type { InventoryCar } from '../sim/inventory'
import { rankById } from '../sim/progression'
import {
  bayCount,
  findingBlocker,
  GARAGE_EXPANSION,
  JOBS,
  minutesLeft,
  RATE_IDS,
  RATE_LEVELS,
  RECON_MAX,
  reconBlocker,
  reconGain,
  wasLate,
  type RateLevel,
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
  const car = job?.client ?? (job?.carId ? inventory.find((c) => c.id === job.carId) : undefined)
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
            : `${car ? carName(car.model) : 'A car'}${job.client ? `, ${job.client.name}'s` : ''} · ${
                working
                  ? `${mechanic!.name}, ready about ${formatTime(minute + minutesLeft(job))}`
                  : 'Stalled: nobody is working on it'
              }`}
        </div>
      </div>
    </li>
  )
}

/** Where a client's job stands, for the Clients list. */
function clientStatus(job: ServiceJob): string {
  switch (job.status) {
    case 'waiting':
      return 'Waiting for a bay'
    case 'inBay':
      return `In bay ${job.bay! + 1}`
    case 'ready':
      return 'Ready to collect'
    case 'done':
      return 'Collected'
  }
}

/** What came of the extra work found on `job`, for the Clients list. */
function findingText(job: ServiceJob): string | null {
  const f = job.finding
  if (!f) return null
  const work = `${f.label}, ${formatMoney(f.labor + f.parts)}`
  switch (f.status) {
    case 'accepted':
      return `Added: ${work}`
    case 'declined':
      return `Turned down: ${work}`
    case 'found':
      return job.status === 'inBay' ? `Found: ${work}` : `Missed: ${work}`
  }
}

/**
 * A client's job today: whose car, what it needs, where it stands and what it
 * pays, and any extra work the mechanic found. A client who's away can be
 * phoned about it.
 */
function ClientRow({ job }: { job: ServiceJob }) {
  const touch = useMediaQuery(COARSE)
  const promised = useGame((s) => {
    const c = [...s.customers, ...s.serviceAway].find((x) => x.id === job.customerId)
    return c?.service?.promisedMinute ?? null
  })
  const away = useGame((s) => s.serviceAway.some((c) => c.id === job.customerId))
  const blocker = useGame((s) => findingBlocker(job, s.clock.minute))
  const late = promised !== null && job.status !== 'done' && wasLate(job, promised)
  const found = job.status === 'inBay' && job.finding?.status === 'found'
  const finding = findingText(job)
  return (
    <li className="stock-row">
      <div className="stock-who">
        <div className="staff-name">
          {job.client!.name}
          <span className="stock-badge">{job.redo ? 'Redo' : JOBS[job.kind].label}</span>
        </div>
        <div className="staff-meta">
          {carName(job.client!.model)} · {clientStatus(job)}
          {promised !== null && job.status !== 'done' && ` · promised ${formatTime(promised)}`}
          {late && ' (late)'}
        </div>
        {finding && <div className="staff-meta">{finding}</div>}
      </div>
      <div className="staff-wage price" title="What they pay for labor and parts">
        {job.redo ? 'Free' : formatMoney(job.labor + job.parts)}
      </div>
      {found && (
        <div className="stock-actions">
          {away ? (
            <button
              className="btn btn-small btn-primary"
              disabled={!!blocker}
              title={blocker ?? 'Phone them about the extra work'}
              onClick={() => useGame.getState().callClient(job.id)}
            >
              Call
            </button>
          ) : (
            <span className="muted" title="Choose Recommend work on them in the garage">
              In the garage
            </span>
          )}
        </div>
      )}
      {touch && found && away && blocker && <div className="stock-why muted">{blocker}</div>}
    </li>
  )
}

/** "Busier", "Quieter": what a rate does to the number of clients, against the standard. */
function demandWord(rate: RateLevel): string {
  const d = RATE_LEVELS[rate].demand
  return d > 1 ? 'more clients' : d < 1 ? 'fewer clients' : 'the usual clients'
}

/** The shop rate: what labor costs clients, and what that does to how many come and say yes. */
function RatePicker() {
  const rate = useGame((s) => s.service.rate)
  return (
    <>
      <h3>Shop rate</h3>
      <div className="service-rates" role="radiogroup" aria-label="Shop rate">
        {RATE_IDS.map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={rate === id}
            className={rate === id ? 'btn btn-small btn-primary' : 'btn btn-small'}
            title={`${formatMoney(RATE_LEVELS[id].hourly)} an hour of labor, ${demandWord(id)}`}
            onClick={() => useGame.getState().setServiceRate(id)}
          >
            {RATE_LEVELS[id].label} · {formatMoney(RATE_LEVELS[id].hourly)}/h
          </button>
        ))}
      </div>
      <p className="muted">
        A lower rate brings {demandWord('budget')} (from tomorrow), and more of them say yes to a
        quote or extra work. A higher one earns more per hour from fewer. New quotes use it now.
      </p>
    </>
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
  const waiting = jobs.filter((j) => j.status === 'waiting' && j.carId)
  const clients = jobs.filter((j) => j.client)
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
      <RatePicker />
      <h3>Clients</h3>
      {clients.length === 0 ? (
        <p className="muted staff-empty">
          No service clients yet today. They drive in and check in at the garage’s counter.
        </p>
      ) : (
        <ul className="staff-list">
          {clients.map((j) => (
            <ClientRow key={j.id} job={j} />
          ))}
        </ul>
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
        <dt>Client jobs</dt>
        <dd>{stats.service.jobs}</dd>
        {stats.service.offered > 0 && (
          <>
            <dt>Extra work sold</dt>
            <dd>
              {stats.service.upsold} of {stats.service.offered}
            </dd>
          </>
        )}
        {stats.service.comebacks > 0 && (
          <>
            <dt>Came back</dt>
            <dd>{stats.service.comebacks}</dd>
          </>
        )}
        <dt>Reconditioned</dt>
        <dd>{stats.service.recon}</dd>
        <dt>Service income</dt>
        <dd className="price">{formatMoney(serviceGross(stats))}</dd>
      </dl>
      <p className="muted">
        Anything still in a bay at closing, and clients’ cars waiting for one, are finished in
        overtime. Our own cars waiting for a bay go back on sale, with their parts money back.
      </p>
    </>
  )
}
