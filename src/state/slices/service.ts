import { afterService, recallClient, type ServiceOutcome } from '../../sim/clientService'
import { CLOSE_MINUTE, formatTime, isClosed, type GameTime } from '../../sim/clock'
import { PLAYER_ID, PLAYER_SKILL, reduceCustomers, type Customer } from '../../sim/customers'
import { expansionsUp } from '../../sim/expansions'
import { formatMoney } from '../../sim/format'
import { carName } from '../../sim/interactables'
import { recallOn } from '../../sim/recalls'
import { vehicleTargetId } from '../../sim/sellers'
import {
  acceptFinding,
  bayCount,
  clientJob,
  comebackChance,
  comebackMinute,
  declineFinding,
  findingBlocker,
  finishedLate,
  finishRecon,
  inTime,
  jobMinutesFor,
  laterPromise,
  overtimeFor,
  promiseMinute,
  quoteTotal,
  RECON_MAX,
  reconBlocker,
  reconJob,
  reconPartsCost,
  returnFromShop,
  rollFinding,
  stampReady,
  takeDueVisits,
  upsellChance,
  wasLate,
  type Comeback,
  type ServiceJob,
  type ServiceStats,
} from '../../sim/service'
import {
  bookServiceClient,
  comebackClient,
  freeServiceSpot,
  freeServiceSpots,
  quoteAcceptChance,
  serviceClient,
  WAIT_LIMIT,
} from '../../sim/serviceClients'
import { MIN_SKILL } from '../../sim/staff'
import { mechanicWorking } from '../../sim/staffAi'
import { commit, dispatch, notify, tuning, type Kit } from '../core'
import { advisorAtPost, mechanicCount, reconBook } from '../derived'
import { rng } from '../rng'
import type { GameState } from '../types'

type ServiceKeys =
  | 'staffCheckIn'
  | 'staffRecommend'
  | 'callClient'
  | 'serviceCollect'
  | 'serviceWentAway'
  | 'staffStartJob'
  | 'recondition'
  | 'setAutoRecon'
  | 'setServiceRate'

/**
 * The service department: client jobs, findings, comebacks and reconditioning.
 * (Its jobs, visits and settings start with `dayOne`.)
 */
export function serviceSlice(k: Kit): Pick<GameState, ServiceKeys> {
  const { get, set } = k
  return {
    staffCheckIn: (employeeId, customerId) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      if (e?.role !== 'advisor' || e.fired || e.status !== 'atPost') return
      if (s.activeAction?.targetId === customerId) return
      checkIn(k, customerId, employeeId)
    },
    staffRecommend: (employeeId, jobId) => {
      const e = get().roster.find((x) => x.id === employeeId)
      if (e?.role !== 'advisor' || e.fired || e.status !== 'atPost') return
      offerFinding(k, jobId, employeeId)
    },
    callClient: (jobId) => {
      const s = get()
      const job = s.serviceJobs.find((j) => j.id === jobId)
      if (!s.serviceAway.some((c) => c.id === job?.customerId)) return
      offerFinding(k, jobId, PLAYER_ID)
    },
    serviceCollect: (customerId) => {
      const s = get()
      const c = s.customers.find((x) => x.id === customerId)
      const job = c?.service && s.serviceJobs.find((j) => j.id === c.service!.jobId)
      if (c?.phase !== 'servicing' || job?.status !== 'ready') return
      collected(k, job, c)
      commit(k, reduceCustomers(get().customers, { type: 'collect', id: customerId }))
      const paid = job.labor + job.parts
      const car = carName(c.service!.car.model)
      notify(
        k,
        job.warranty === 0
          ? `${c.name} collected their ${car} and paid ${formatMoney(paid)}.`
          : `${c.name} collected their ${car}${paid > 0 ? ` and paid ${formatMoney(paid)}` : ''}. The manufacturer pays ${formatMoney(job.warranty)}.`,
      )
    },
    serviceWentAway: (customerId) => {
      const s = get()
      const c = s.customers.find((x) => x.id === customerId)
      if (c?.phase !== 'servicing' || !c.service?.dropOff || c.service.returned) return
      set({ serviceAway: [...s.serviceAway, c] })
      commit(k, reduceCustomers(get().customers, { type: 'wentAway', id: customerId }))
    },
    staffStartJob: (employeeId, jobId, bay) => {
      const s = get()
      const e = s.roster.find((x) => x.id === employeeId)
      const job = s.serviceJobs.find((j) => j.id === jobId)
      if (e?.role !== 'mechanic' || !mechanicWorking(s.roster, e.id) || !job) return
      let next: ServiceJob
      if (job.status === 'inBay') {
        // Taking over a job someone else left: the time already in it counts.
        if (job.mechanicId === e.id || mechanicWorking(s.roster, job.mechanicId)) return
        next = { ...job, mechanicId: e.id }
      } else {
        const taken = s.serviceJobs.some((j) => j.status === 'inBay' && j.bay === bay)
        if (job.status !== 'waiting' || taken || bay >= bayCount(expansionsUp(s))) return
        next = {
          ...job,
          status: 'inBay',
          bay,
          mechanicId: e.id,
          minutes: jobMinutesFor(job, e.skill),
          // Clients' cars get looked over: there may be more that needs doing.
          finding:
            job.customerId && !job.redo ? rollFinding(job.kind, s.service.rate, rng.service) : null,
        }
      }
      set({ serviceJobs: s.serviceJobs.map((j) => (j === job ? next : j)) })
      const f = next.finding
      if (f && !job.finding && !advisorAtPost(s.roster)) {
        notify(
          k,
          `${e.name} found more work on ${next.client!.name}'s car: ${f.label.toLowerCase()}, ${formatMoney(f.labor + f.parts)}. Recommend it to them, or call from the Service tab.`,
        )
      }
    },
    recondition: (carId) => {
      const s = get()
      const blocker = reconBlocker(reconBook(s), carId)
      const partsCost = blocker ? 0 : reconPartsCost(rng.service)
      const reason = blocker ?? (s.cash < partsCost ? 'Not enough cash for the parts.' : null)
      if (reason) {
        notify(k, reason)
        return false
      }
      queueRecon(k, carId, partsCost)
      const car = get().inventory.find((c) => c.id === carId)!
      notify(
        k,
        `The ${carName(car.model)} went to the shop for reconditioning. Parts: ${formatMoney(partsCost)}.`,
      )
      return true
    },
    setAutoRecon: (on) => {
      const service = get().service
      if (service.autoRecon !== on) set({ service: { ...service, autoRecon: on } })
    },
    setServiceRate: (rate) => {
      const service = get().service
      if (service.rate !== rate) set({ service: { ...service, rate } })
    },
  }
}

/**
 * At closing: jobs in the bays, and clients' cars still waiting for one, are
 * finished in overtime. Our own cars still waiting go back on sale, and the
 * parts money comes back. Clients who dropped their car off are booked as
 * collecting it after hours.
 */
export function closeShop(k: Kit): void {
  const { get, set } = k
  const s = get()
  const late = s.serviceJobs.filter(
    (j) => j.status === 'inBay' || (j.status === 'waiting' && j.customerId),
  )
  const unstarted = s.serviceJobs.filter((j) => j.status === 'waiting' && j.carId)
  if (late.length === 0 && unstarted.length === 0 && s.serviceAway.length === 0) return
  const overtime = late.reduce((sum, j) => sum + overtimeFor(j), 0)
  const refund = unstarted.reduce((sum, j) => sum + j.partsCost, 0)
  let inventory = s.inventory
  for (const j of unstarted) inventory = returnFromShop(inventory, j.carId!)
  set({
    inventory,
    cash: s.cash + refund - overtime,
    serviceJobs: stampReady(
      s.serviceJobs
        .filter((j) => !unstarted.includes(j))
        .map((j) => (late.includes(j) ? finishedLate(j) : j)),
      CLOSE_MINUTE,
    ),
  })
  addService(k, { overtime })
  jobsDone(k, late.map(finishedLate), true)
  for (const c of get().serviceAway) {
    const job = get().serviceJobs.find((j) => j.id === c.service?.jobId)
    if (job?.status === 'ready') collected(k, job, c)
  }
  set({ serviceAway: [] })
}

/** Adds to today's service tally. */
function addService(k: Kit, change: Partial<Record<keyof ServiceStats, number>>): void {
  const stats = k.get().dayStats
  const service = { ...stats.service }
  for (const [key, n] of Object.entries(change) as [keyof ServiceStats, number][]) {
    service[key] += n
  }
  k.set({ dayStats: { ...stats, service } })
}

/**
 * Client `c` pays for `job`, which is ready: labor and parts come in (and
 * the manufacturer's pay for recall work), the parts' cost goes out, and
 * the job is done. Late if it was ready after the time they were promised.
 */
function collected(k: Kit, job: ServiceJob, c: Customer): void {
  const s = k.get()
  k.set({
    cash: s.cash + job.labor + job.parts - job.partsCost + job.warranty,
    serviceJobs: s.serviceJobs.map((j) => (j === job ? { ...j, status: 'done' as const } : j)),
  })
  addService(k, {
    jobs: job.redo ? 0 : 1,
    recalls: job.kind === 'recall' && !job.redo ? 1 : 0,
    warranty: job.warranty,
    labor: job.labor,
    parts: job.parts,
    partsCost: job.partsCost,
    late: wasLate(job, c.service?.promisedMinute ?? null) ? 1 : 0,
  })
  if (!job.redo) {
    serviceBook(k, c, wasLate(job, c.service?.promisedMinute ?? null) ? 'late' : 'serviced')
    rollComeback(k, job, c)
  }
}

/** How a service visit by client `c` from the book went moves their record. */
function serviceBook(k: Kit, c: Customer, outcome: ServiceOutcome): void {
  if (!c.clientId) return
  const s = k.get()
  const clients = afterService(s.clients, c.clientId, outcome, s.clock.day)
  if (clients !== s.clients) k.set({ clients })
}

/**
 * Whether `job`, just collected by `c`, holds: the less skilled its
 * mechanic, the likelier it doesn't, and the client drives back in for a
 * free redo later in the day. Too late for that, they only grumble.
 */
function rollComeback(k: Kit, job: ServiceJob, c: Customer): void {
  const s = k.get()
  const skill = s.roster.find((e) => e.id === job.mechanicId)?.skill ?? MIN_SKILL
  if (rng.service.next() >= comebackChance(skill, tuning(k).comebackScale)) return
  addService(k, { comebacks: 1 })
  serviceBook(k, c, 'comeback')
  const minute = isClosed(s.clock) ? null : comebackMinute(s.clock.minute)
  if (minute === null) return
  k.set({ serviceComebacks: [...k.get().serviceComebacks, { minute, client: c }] })
}

/**
 * `by` (the player or the service advisor) offers the client of job `jobId`
 * the extra work the mechanic found: in person, or by phone if they're away.
 * Taken, the job and the bill grow and the car is promised later.
 */
export function offerFinding(k: Kit, jobId: string, by: string): void {
  const { get, set } = k
  const s = get()
  const job = s.serviceJobs.find((j) => j.id === jobId)
  const c = [...s.customers, ...s.serviceAway].find((x) => x.id === job?.customerId)
  if (!job || !c?.service || c.phase !== 'servicing') return
  const player = by === PLAYER_ID
  const blocker = findingBlocker(job, s.clock.minute)
  if (blocker) {
    if (player) notify(k, blocker)
    return
  }
  const f = job.finding!
  const skill = player ? PLAYER_SKILL : (s.roster.find((e) => e.id === by)?.skill ?? MIN_SKILL)
  const yes = rng.service.next() < upsellChance(s.service.rate, c.archetype, skill)
  const mechanic = s.roster.find((e) => e.id === job.mechanicId)?.skill ?? MIN_SKILL
  const next = yes ? acceptFinding(job, mechanic) : declineFinding(job)
  set({ serviceJobs: s.serviceJobs.map((j) => (j === job ? next : j)) })
  addService(k, { offered: 1, upsold: yes ? 1 : 0 })
  const promised = c.service.promisedMinute
  if (yes && promised !== null) {
    const ev = {
      type: 'repromise',
      id: c.id,
      promisedMinute: laterPromise(promised, next.minutes - job.minutes),
    } as const
    set({ serviceAway: reduceCustomers(get().serviceAway, ev) })
    commit(k, reduceCustomers(get().customers, ev))
  }
  const work = `${f.label.toLowerCase()}, ${formatMoney(f.labor + f.parts)}`
  if (player) {
    notify(
      k,
      yes
        ? `${c.name}: "Go ahead, fix the ${f.label.toLowerCase()} too."`
        : `${c.name}: "Not today, thanks."`,
    )
  } else if (yes) {
    const who = s.roster.find((e) => e.id === by)?.name ?? 'Your advisor'
    notify(k, `${who} sold ${c.name} extra work: ${work}.`)
  }
}

/** `by` (the player or the service advisor) checks service client `id` in and quotes the job. */
export function checkIn(k: Kit, id: string, by: string): void {
  const c = k.get().customers.find((x) => x.id === id)
  if (!c?.service || c.phase !== 'waiting') return
  if (c.handlerId !== null && c.handlerId !== by) return
  commit(k, reduceCustomers(k.get().customers, { type: 'greet', id, carId: null, by }))
  const price = quoteTotal(c.service.quote)
  const ev = { type: 'offer', id, carId: vehicleTargetId(id), price } as const
  commit(k, reduceCustomers(k.get().customers, ev))
}

/**
 * Service client `c` answers the quote. With no mechanic, or no time left
 * to do the job by closing, they're turned away; otherwise they take it
 * (more likely at a lower shop rate) or not. Taken, the job is booked with a
 * time it'll be ready: soon enough and they wait, otherwise they drop the car off.
 */
export function answerService(k: Kit, c: Customer): void {
  const { get, set } = k
  const s = get()
  const visit = c.service!
  const player = c.handlerId === PLAYER_ID
  const mechanics = mechanicCount(s.roster)
  const promised = promiseMinute(s.clock.minute, s.serviceJobs, visit.kind, mechanics)
  const walk = () =>
    commit(k, reduceCustomers(get().customers, { type: 'respond', id: c.id, answer: 'walk' }))
  if (!inTime(promised)) {
    addService(k, { turnedAway: 1 })
    serviceBook(k, c, 'turnedAway')
    walk()
    if (!player) return
    return notify(
      k,
      mechanics === 0
        ? `There's no mechanic to do the work, so ${c.name} drove off.`
        : `The garage can't fit ${c.name}'s car in before closing. They drove off.`,
    )
  }
  // A redo or recall work is free: nobody turns that down.
  const free = visit.comeback || visit.kind === 'recall'
  if (!free && rng.service.next() >= quoteAcceptChance(s.service.rate, c.archetype)) {
    addService(k, { declined: 1 })
    serviceBook(k, c, 'turnedAway')
    walk()
    if (player) notify(k, `${c.name}: "That's more than I want to spend. I'll go elsewhere."`)
    return
  }
  const n = s.serviceJobs.filter((j) => j.customerId).length + 1
  const jobId = `client-${s.clock.day}-${n}`
  const client = { name: c.name, model: visit.car.model, condition: visit.car.condition }
  const job = clientJob(jobId, visit.kind, c.id, visit.quote, client, visit.comeback)
  const dropOff = promised - s.clock.minute > WAIT_LIMIT
  set({ serviceJobs: [...s.serviceJobs, job] })
  const ev = { type: 'booked', id: c.id, jobId, promisedMinute: promised, dropOff } as const
  commit(k, reduceCustomers(get().customers, ev))
  if (!player) return
  const again = visit.comeback ? `It's doing it again. ` : ''
  notify(
    k,
    dropOff
      ? `${c.name}: "${again}I'll leave it with you and come back at ${formatTime(promised)}."`
      : `${c.name}: "${again}Ready by ${formatTime(promised)}? I'll wait."`,
  )
}

/**
 * Service clients due by `step` drive in while a service space is free (the
 * rest wait for one), and drop-offs whose time has come walk back in.
 * Clients from the book come by name, and a recall visit is one of the
 * book's drivers of the recalled model while there's one who hasn't been
 * in. Nobody new after closing.
 */
export function serviceArrivals(k: Kit, step: GameTime, present: readonly Customer[]) {
  const s = k.get()
  if (isClosed(step)) {
    return { schedule: s.serviceVisits, arrived: [], away: s.serviceAway, comebacks: [] }
  }
  const free = freeServiceSpots(present, s.serviceAway)
  const { schedule, due, clientIds } = takeDueVisits(s.serviceVisits, step.minute, free)
  const arrived: Customer[] = []
  const recalled = recallOn(step.day, bayCount(expansionsUp(s)))?.model ?? null
  // Nobody from the book twice: not those on the lot, away, or just arrived.
  const busy = new Set(
    [...present, ...s.serviceAway].flatMap((c) => (c.clientId ? [c.clientId] : [])),
  )
  due.forEach((kind, i) => {
    const id = `service-${step.day}-${s.serviceVisits.spawned + i + 1}`
    const spot = freeServiceSpot([...present, ...arrived], s.serviceAway)!
    const rate = s.service.rate
    const patience = tuning(k).patience
    const named = clientIds[i]
    const client =
      named !== null
        ? s.clients.find((c) => c.id === named && !busy.has(c.id))
        : kind === 'recall' && recalled
          ? recallClient(s.clients, recalled, step.day, busy, rng.client)
          : null
    if (client?.car) {
      busy.add(client.id)
      arrived.push(bookServiceClient(client, id, kind, spot, rng.service, step.day, rate, patience))
      return
    }
    // A client from the book who can't come (on the lot already) doesn't.
    if (named !== null) return
    arrived.push(serviceClient(id, kind, spot, rng.service, step.day, rate, patience, recalled))
  })
  // Clients whose job didn't hold drive back in, while there's a space.
  const comebacks: Comeback[] = []
  for (const back of s.serviceComebacks) {
    const spot =
      back.minute <= step.minute ? freeServiceSpot([...present, ...arrived], s.serviceAway) : null
    if (spot === null) {
      comebacks.push(back)
      continue
    }
    const n = s.serviceComebacks.length - comebacks.length
    arrived.push(comebackClient(back.client, `comeback-${step.day}-${step.minute}-${n}`, spot))
  }
  const due2 = (c: Customer) => (c.service?.promisedMinute ?? Infinity) <= step.minute
  for (const c of s.serviceAway.filter(due2)) {
    arrived.push({ ...c, phase: 'servicing', service: { ...c.service!, returned: true } })
  }
  return { schedule, arrived, away: s.serviceAway.filter((c) => !due2(c)), comebacks }
}

/**
 * Books jobs that just finished: a reconditioned car goes back on sale,
 * better and dearer. `late`: finished after closing, so said quietly.
 */
export function jobsDone(k: Kit, done: readonly ServiceJob[], late = false): void {
  const recon = done.filter((j) => j.status === 'done' && j.carId)
  if (recon.length === 0) return
  const s = k.get()
  let inventory = s.inventory
  for (const j of recon) inventory = finishRecon(inventory, j.carId!, j.partsCost, s.clock.day)
  const stats = k.get().dayStats
  k.set({
    inventory,
    dayStats: {
      ...stats,
      service: { ...stats.service, recon: stats.service.recon + recon.length },
    },
  })
  if (late) return
  for (const j of recon) {
    const car = inventory.find((c) => c.id === j.carId)
    if (car) {
      notify(
        k,
        `The ${carName(car.model)} is back from the shop, on sale at ${formatMoney(car.msrp)}.`,
      )
    }
  }
}

/** Sends car `carId` to the shop, its parts paid for now. */
function queueRecon(k: Kit, carId: string, partsCost: number): void {
  const s = k.get()
  const n = s.serviceJobs.filter((j) => j.kind === 'recon').length + 1
  k.set({
    cash: s.cash - partsCost,
    inventory: s.inventory.map((c) => (c.id === carId ? { ...c, status: 'recon' } : c)),
    serviceJobs: [...s.serviceJobs, reconJob(`recon-${s.clock.day}-${n}`, carId, partsCost)],
    menu: s.menu?.targetId === carId ? null : s.menu,
    hoveredId: s.hoveredId === carId ? null : s.hoveredId,
    inspectedId: s.inspectedId === carId ? null : s.inspectedId,
  })
  if (s.activeAction?.targetId === carId) dispatch(k, { type: 'cancel' })
}

/**
 * With reconditioning on its own, the used cars taken in yesterday that need
 * it go to the shop, while there's cash for the parts. Returns how many went.
 */
export function autoRecon(k: Kit, day: number): number {
  const { get } = k
  if (!get().service.autoRecon) return 0
  const due = get().inventory.filter(
    (c) => c.used && c.used.acquiredDay === day - 1 && c.used.condition < RECON_MAX,
  )
  let sent = 0
  for (const car of due) {
    if (reconBlocker(reconBook(get()), car.id)) continue
    const partsCost = reconPartsCost(rng.service)
    if (get().cash < partsCost) break
    queueRecon(k, car.id, partsCost)
    sent++
  }
  return sent
}
