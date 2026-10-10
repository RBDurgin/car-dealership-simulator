import { describe, expect, it } from 'vitest'
import { emptyCareer } from './progression'
import { createRng } from './rng'
import {
  acceptFinding,
  bayCount,
  clientJob,
  COMEBACK_DELAY,
  comebackChance,
  comebackMinute,
  declineFinding,
  FINDING_ACCEPT,
  FINDING_CHANCE,
  findingBlocker,
  jobMinutesFor,
  laterPromise,
  openFinding,
  REDO_SHARE,
  rollFinding,
  upsellChance,
  type Finding,
  emptySchedule,
  finishedLate,
  finishRecon,
  GARAGE_BAYS,
  GARAGE_EXPANSION,
  isRateLevel,
  JOB_KINDS,
  jobMinutes,
  jobPriority,
  JOBS,
  JOBS_PER_BAY,
  LAST_SERVICE_MINUTE,
  minutesLeft,
  OVERTIME_HOURLY,
  overtimeFor,
  PARTS_MARKUP,
  planServiceVisits,
  quote,
  RATE_LEVELS,
  recallQuote,
  RECON_MAX,
  RECON_STEP,
  reconBlocker,
  reconCondition,
  reconGain,
  reconJob,
  returnFromShop,
  serviceDemand,
  takeDueVisits,
  TOWN_SERVICE,
  WARRANTY_HOURLY,
  warrantyPay,
  workJobs,
  type ReconBook,
  type ServiceJob,
} from './service'
import { buildInventory, type InventoryCar } from './inventory'
import { usedStockCar } from './usedCars'
import { CLOSE_MINUTE, OPEN_MINUTE } from './clock'

const sold = (sales: number) => ({ ...emptyCareer(), sales })
// Day 1 is a Monday, day 7 a Sunday.
const MONDAY = 1
const THURSDAY = 4
const SUNDAY = 7
const opts = { bays: GARAGE_BAYS, rate: 'standard' as const }

describe('jobs', () => {
  it('book 30 to 150 minutes each, with a parts range and a label', () => {
    for (const kind of JOB_KINDS) {
      const { minutes, parts, label } = JOBS[kind]
      expect(minutes).toBeGreaterThanOrEqual(30)
      expect(minutes).toBeLessThanOrEqual(150)
      expect(parts.min).toBeLessThanOrEqual(parts.max)
      expect(label).not.toBe('')
    }
  })

  it('go faster with a better mechanic, at book time for a middling one', () => {
    expect(jobMinutes('brakes', 3)).toBe(JOBS.brakes.minutes)
    expect(jobMinutes('brakes', 5)).toBeLessThan(jobMinutes('brakes', 3))
    expect(jobMinutes('brakes', 1)).toBeGreaterThan(jobMinutes('brakes', 3))
  })
})

describe('quotes', () => {
  it('charge book time at the shop rate and mark the parts up', () => {
    const q = quote('brakes', 'standard', createRng(1))
    expect(q.labor).toBe(1.5 * RATE_LEVELS.standard.hourly)
    expect(q.partsCost).toBeGreaterThanOrEqual(JOBS.brakes.parts.min)
    expect(q.partsCost).toBeLessThanOrEqual(JOBS.brakes.parts.max)
    expect(q.parts).toBe(Math.round(q.partsCost * (1 + PARTS_MARKUP)))
  })

  it('cost more at a dearer rate, for the same parts', () => {
    const budget = quote('repair', 'budget', createRng(2))
    const standard = quote('repair', 'standard', createRng(2))
    const premium = quote('repair', 'premium', createRng(2))
    expect(budget.labor).toBeLessThan(standard.labor)
    expect(standard.labor).toBeLessThan(premium.labor)
    expect(budget.partsCost).toBe(premium.partsCost)
  })

  it('gross about $150–400 on a customer-pay job at the standard rate', () => {
    const rng = createRng(3)
    const gross = (['tires', 'brakes', 'repair'] as const).map((kind) => {
      const q = quote(kind, 'standard', rng)
      return q.labor + q.parts - q.partsCost
    })
    for (const g of gross) {
      expect(g).toBeGreaterThan(150)
      expect(g).toBeLessThan(500)
    }
  })

  it('know their rate levels', () => {
    expect(isRateLevel('premium')).toBe(true)
    expect(isRateLevel('free')).toBe(false)
  })
})

describe('service demand', () => {
  it('needs a garage', () => {
    expect(bayCount([])).toBe(0)
    expect(bayCount(['east-lot'])).toBe(0)
    expect(bayCount(['east-lot', GARAGE_EXPANSION])).toBe(GARAGE_BAYS)
    expect(serviceDemand(THURSDAY, sold(200), { ...opts, bays: 0 })).toBe(0)
  })

  it('rises with the cars sold over the game', () => {
    expect(serviceDemand(THURSDAY, sold(0), opts)).toBe(TOWN_SERVICE)
    expect(serviceDemand(THURSDAY, sold(200), opts)).toBeGreaterThan(
      serviceDemand(THURSDAY, sold(40), opts),
    )
  })

  it('follows the week: Monday busiest, nobody on Sunday', () => {
    const career = sold(100)
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => serviceDemand(d, career, opts))
    expect(Math.max(...week)).toBe(serviceDemand(MONDAY, career, opts))
    expect(serviceDemand(SUNDAY, career, opts)).toBe(0)
  })

  it('scales with the shop rate and the level', () => {
    const career = sold(100)
    const standard = serviceDemand(THURSDAY, career, opts)
    expect(serviceDemand(THURSDAY, career, { ...opts, rate: 'budget' })).toBeGreaterThan(standard)
    expect(serviceDemand(THURSDAY, career, { ...opts, rate: 'premium' })).toBeLessThan(standard)
    expect(serviceDemand(THURSDAY, career, { ...opts, factor: 0.8 })).toBeCloseTo(standard * 0.8)
  })

  it('is capped by the bays', () => {
    expect(serviceDemand(MONDAY, sold(10_000), opts)).toBe(GARAGE_BAYS * JOBS_PER_BAY)
  })
})

describe('service visits', () => {
  it('plan nothing when none are expected', () => {
    expect(planServiceVisits(createRng(1), 0)).toEqual(emptySchedule())
  })

  it('plan about the expected number within opening hours, in order', () => {
    const plan = planServiceVisits(createRng(4), 5)
    expect(plan.minutes).toHaveLength(5)
    expect(plan.kinds).toHaveLength(5)
    expect([...plan.minutes].sort((a, b) => a - b)).toEqual(plan.minutes)
    for (const m of plan.minutes) {
      expect(m).toBeGreaterThanOrEqual(OPEN_MINUTE)
      expect(m).toBeLessThanOrEqual(LAST_SERVICE_MINUTE)
    }
    for (const kind of plan.kinds) expect(['oil', 'tires', 'brakes', 'repair']).toContain(kind)
  })

  it('roll the fraction', () => {
    const counts = new Set(
      Array.from({ length: 40 }, (_, i) => planServiceVisits(createRng(i), 2.5).minutes.length),
    )
    expect(counts).toEqual(new Set([2, 3]))
  })

  it('are deterministic per seed', () => {
    expect(planServiceVisits(createRng(9), 4)).toEqual(planServiceVisits(createRng(9), 4))
  })

  it('add recall visits on top, leaving the rest as they were', () => {
    const plain = planServiceVisits(createRng(6), 4)
    const plan = planServiceVisits(createRng(6), 4, 3)
    const recalls = plan.kinds.filter((k) => k === 'recall')
    expect(recalls).toHaveLength(3)
    expect([...plan.minutes].sort((a, b) => a - b)).toEqual(plan.minutes)
    const rest = plan.kinds.flatMap((k, i) => (k === 'recall' ? [] : [[plan.minutes[i], k]]))
    expect(rest).toEqual(plain.kinds.map((k, i) => [plain.minutes[i], k]))
    expect(planServiceVisits(createRng(6), 0, 2).kinds).toEqual(['recall', 'recall'])
  })

  it('are released as they fall due, once each', () => {
    const plan = planServiceVisits(createRng(5), 4)
    const first = takeDueVisits(plan, plan.minutes[1])
    expect(first.due).toEqual(plan.kinds.slice(0, 2))
    const again = takeDueVisits(first.schedule, plan.minutes[1])
    expect(again.due).toEqual([])
    expect(again.schedule).toBe(first.schedule)
    expect(takeDueVisits(first.schedule, LAST_SERVICE_MINUTE).due).toEqual(plan.kinds.slice(2))
  })
})

describe('comebacks', () => {
  it('are about 15% at skill 1 and 2% at skill 5, falling with skill', () => {
    expect(comebackChance(1)).toBeCloseTo(0.15)
    expect(comebackChance(5)).toBeCloseTo(0.02)
    for (let s = 1; s < 5; s++) expect(comebackChance(s + 1)).toBeLessThan(comebackChance(s))
    expect(comebackChance(9)).toBeCloseTo(0.02)
  })

  it('scale with the level', () => {
    expect(comebackChance(1, 0.5)).toBeCloseTo(0.075)
    expect(comebackChance(1, 1.5)).toBeCloseTo(0.225)
  })

  it('drive back in COMEBACK_DELAY later, unless that is too late in the day', () => {
    expect(comebackMinute(600)).toBe(600 + COMEBACK_DELAY)
    expect(comebackMinute(LAST_SERVICE_MINUTE - COMEBACK_DELAY)).toBe(LAST_SERVICE_MINUTE)
    expect(comebackMinute(LAST_SERVICE_MINUTE - COMEBACK_DELAY + 10)).toBeNull()
  })

  it('take half the time to redo', () => {
    const job = { kind: 'brakes' as const, redo: true }
    expect(jobMinutesFor(job, 3)).toBe(Math.round(jobMinutes('brakes', 3) * REDO_SHARE))
    expect(jobMinutesFor({ ...job, redo: false }, 3)).toBe(jobMinutes('brakes', 3))
  })
})

describe('findings', () => {
  const finding: Finding = {
    label: 'Worn brake pads',
    minutes: 60,
    labor: 120,
    parts: 140,
    partsCost: 100,
    status: 'found',
  }
  const client = { name: 'Sam', model: 'sedan' as const, condition: 0.5 }
  const base = clientJob('client-1-1', 'oil', 'c1', { labor: 60, parts: 50, partsCost: 35 }, client)
  const inBay: ServiceJob = { ...base, status: 'inBay', bay: 0, minutes: 30, finding }

  it('turn up FINDING_CHANCE of the time, priced at the shop rate, never on recon', () => {
    const rolls = Array.from({ length: 2000 }, (_, i) =>
      rollFinding('oil', 'standard', createRng(i)),
    )
    const found = rolls.filter((f) => f !== null)
    expect(found.length / rolls.length).toBeCloseTo(FINDING_CHANCE, 1)
    for (const f of found) {
      expect(f.status).toBe('found')
      expect(f.labor).toBe(Math.round((f.minutes / 60) * RATE_LEVELS.standard.hourly))
      expect(f.parts).toBe(Math.round(f.partsCost * (1 + PARTS_MARKUP)))
      // About a customer-pay job's worth or less.
      expect(f.labor + f.parts).toBeLessThan(500)
    }
    for (let i = 0; i < 100; i++) expect(rollFinding('recon', 'standard', createRng(i))).toBeNull()
  })

  it("aren't what the job already covers", () => {
    for (let i = 0; i < 500; i++) {
      const f = rollFinding('brakes', 'premium', createRng(i))
      if (f) expect(f.label).not.toMatch(/brake/i)
    }
  })

  it('are taken about half the time at the standard rate, less at a dearer one or from the less skilled', () => {
    expect(upsellChance('standard', 'regular', 3)).toBeCloseTo(FINDING_ACCEPT)
    expect(upsellChance('budget', 'regular', 3)).toBeGreaterThan(
      upsellChance('standard', 'regular', 3),
    )
    expect(upsellChance('premium', 'regular', 3)).toBeLessThan(
      upsellChance('standard', 'regular', 3),
    )
    expect(upsellChance('standard', 'regular', 5)).toBeGreaterThan(
      upsellChance('standard', 'regular', 1),
    )
    expect(upsellChance('premium', 'tire-kicker', 1)).toBeGreaterThanOrEqual(0.1)
    expect(upsellChance('budget', 'decisive', 5)).toBeLessThanOrEqual(0.9)
  })

  it('can be offered only while the car is in its bay and there is time before closing', () => {
    expect(openFinding(inBay)).toBe(finding)
    expect(findingBlocker(inBay, 600)).toBeNull()
    expect(findingBlocker(inBay, CLOSE_MINUTE - 60)).toMatch(/time/)
    expect(openFinding({ ...inBay, status: 'ready' })).toBeNull()
    expect(findingBlocker({ ...inBay, status: 'ready' }, 600)).not.toBeNull()
    expect(openFinding({ ...inBay, finding: { ...finding, status: 'declined' } })).toBeNull()
    expect(openFinding(undefined)).toBeNull()
  })

  it('add their work and bill to the job when taken, and nothing when turned down', () => {
    const taken = acceptFinding(inBay, 3)
    expect(taken).toMatchObject({
      minutes: 30 + 60,
      labor: 60 + 120,
      parts: 50 + 140,
      partsCost: 35 + 100,
      finding: { status: 'accepted' },
    })
    expect(acceptFinding(taken, 3)).toBe(taken)
    expect(acceptFinding(inBay, 5).minutes).toBeLessThan(taken.minutes)
    const no = declineFinding(inBay)
    expect(no).toMatchObject({ labor: 60, minutes: 30, finding: { status: 'declined' } })
    expect(declineFinding(no)).toBe(no)
  })

  it('push the promise back to the next 10 minutes', () => {
    expect(laterPromise(600, 45)).toBe(650)
    expect(laterPromise(600, 60)).toBe(660)
  })
})

describe('reconditioning', () => {
  const DAY = 10
  const worn = (condition: number, msrp?: number): InventoryCar => {
    const car = usedStockCar(
      'used-9-1',
      { model: 'sedan', year: 2021, miles: 60_000, condition, acquiredDay: 9 },
      { location: 'lot', index: 20 },
      8_000,
      9,
      0.3,
    )
    return msrp === undefined ? car : { ...car, msrp }
  }
  const inShop = (car: InventoryCar): InventoryCar => ({ ...car, status: 'recon' })

  it('raises condition by a step, up to the cap', () => {
    expect(reconCondition(0.3)).toBeCloseTo(0.3 + RECON_STEP)
    expect(reconCondition(0.8)).toBe(RECON_MAX)
    expect(reconCondition(RECON_MAX)).toBe(RECON_MAX)
  })

  it('adds value to a worn car, nothing to a new one or one in good shape', () => {
    expect(reconGain(worn(0.3), DAY)).toBeGreaterThan(0)
    expect(reconGain(worn(0.3), DAY)).toBeGreaterThan(reconGain(worn(0.75), DAY))
    expect(reconGain(worn(RECON_MAX), DAY)).toBe(0)
    expect(reconGain(buildInventory(createRng(1))[0], DAY)).toBe(0)
  })

  it('pays back about twice its parts on a rough car, and about breaks even near 0.75', () => {
    const avgParts = (JOBS.recon.parts.min + JOBS.recon.parts.max) / 2
    const rough = reconGain(worn(0.4), DAY)
    expect(rough / avgParts).toBeGreaterThan(1.3)
    const good = reconGain(worn(0.75), DAY)
    expect(good / avgParts).toBeGreaterThan(0.5)
    expect(good / avgParts).toBeLessThan(1.3)
  })

  it('hands the car back better, washed, re-listed and with the parts on its cost', () => {
    const car = inShop(worn(0.3))
    const [done] = finishRecon([car], car.id, 500, DAY)
    expect(done.status).toBe('available')
    expect(done.used!.condition).toBeCloseTo(0.6)
    expect(done.cleanliness).toBe(1)
    expect(done.cost).toBe(car.cost + 500)
    expect(done.msrp).toBeGreaterThan(car.msrp)
  })

  it('never lowers the price it was listed at', () => {
    const car = inShop(worn(0.3, 90_000))
    expect(finishRecon([car], car.id, 500, DAY)[0].msrp).toBe(90_000)
  })

  it('leaves a car that is not in the shop alone', () => {
    const inv = [worn(0.3)]
    expect(finishRecon(inv, inv[0].id, 500, DAY)).toBe(inv)
    expect(returnFromShop(inv, inv[0].id)).toBe(inv)
    const back = returnFromShop([inShop(inv[0])], inv[0].id)
    expect(back[0]).toEqual(inv[0])
  })

  describe('reconBlocker', () => {
    const car = worn(0.3)
    const book: ReconBook = {
      inventory: [car],
      customers: [],
      bays: GARAGE_BAYS,
      mechanics: 1,
      closed: false,
    }
    it('lets a worn used car go to the shop', () => {
      expect(reconBlocker(book, car.id)).toBeNull()
    })
    it('says why it can’t', () => {
      expect(reconBlocker({ ...book, bays: 0 }, car.id)).toMatch(/garage/)
      expect(reconBlocker({ ...book, mechanics: 0 }, car.id)).toMatch(/mechanic/)
      expect(reconBlocker({ ...book, closed: true }, car.id)).toMatch(/closed/)
      expect(reconBlocker(book, 'nope')).toMatch(/sold/)
      expect(reconBlocker({ ...book, inventory: [inShop(car)] }, car.id)).toMatch(/shop/)
      expect(reconBlocker({ ...book, inventory: [worn(0.95)] }, car.id)).toMatch(/good enough/)
      const fresh = buildInventory(createRng(1))[0]
      expect(reconBlocker({ ...book, inventory: [fresh] }, fresh.id)).toMatch(/used/)
    })
    it('won’t take a car a customer is looking at or haggling over', () => {
      const looking = { id: 'c', phase: 'talking', targetCarId: car.id, offer: null }
      const haggling = {
        id: 'c',
        phase: 'considering',
        targetCarId: null,
        offer: { carId: car.id, price: 1 },
      }
      const left = { ...looking, phase: 'leaving' }
      for (const c of [looking, haggling]) {
        expect(reconBlocker({ ...book, customers: [c as never] }, car.id)).toMatch(/customer/)
      }
      expect(reconBlocker({ ...book, customers: [left as never] }, car.id)).toBeNull()
    })
  })
})

describe('the clock in the bays', () => {
  const job = (over: Partial<ServiceJob> = {}): ServiceJob => ({
    ...reconJob('r', 'car', 400),
    status: 'inBay',
    bay: 0,
    mechanicId: 'm1',
    minutes: 60,
    ...over,
  })
  const working = (id: string | null) => id === 'm1'

  it('adds time while the mechanic works, and finishes the job', () => {
    const jobs = [job()]
    const half = workJobs(jobs, 30, working)
    expect(half[0]).toMatchObject({ worked: 30, status: 'inBay' })
    expect(workJobs(half, 40, working)[0]).toMatchObject({ worked: 60, status: 'done' })
    // A client's car is ready to collect instead.
    expect(workJobs([job({ customerId: 'c', carId: null })], 60, working)[0].status).toBe('ready')
  })

  it('stalls without a mechanic, and leaves waiting jobs alone', () => {
    const jobs = [job({ mechanicId: 'gone' }), job({ status: 'waiting', bay: null })]
    expect(workJobs(jobs, 30, working)).toBe(jobs)
    expect(workJobs([job()], 0, working)).toEqual([job()])
  })

  it('charges overtime for what was left at closing', () => {
    expect(overtimeFor(job({ worked: 30 }))).toBe(Math.round(0.5 * OVERTIME_HOURLY))
    expect(overtimeFor(job({ worked: 60 }))).toBe(0)
    expect(finishedLate(job({ worked: 10 }))).toMatchObject({ worked: 60, status: 'done' })
    expect(minutesLeft(job({ worked: 45 }))).toBe(15)
  })

  it('puts client jobs before recalls before reconditioning', () => {
    expect(jobPriority(job({ kind: 'oil' }))).toBeLessThan(jobPriority(job({ kind: 'recall' })))
    expect(jobPriority(job({ kind: 'recall' }))).toBeLessThan(jobPriority(job()))
  })
})

describe('recall work', () => {
  const client = { name: 'Sam', model: 'sedan' as const, condition: 0.6 }

  it('costs the client nothing; the manufacturer pays the book time and the parts at cost', () => {
    const q = recallQuote(createRng(3))
    expect(q.labor).toBe(0)
    expect(q.parts).toBe(0)
    expect(q.partsCost).toBeGreaterThanOrEqual(JOBS.recall.parts.min)
    expect(WARRANTY_HOURLY).toBeLessThan(RATE_LEVELS.budget.hourly)
    expect(warrantyPay(100)).toBe(Math.round((JOBS.recall.minutes / 60) * WARRANTY_HOURLY) + 100)
    const job = clientJob('client-1-1', 'recall', 'c1', q, client)
    expect(job.warranty).toBe(warrantyPay(q.partsCost))
  })

  it('pays nothing on a redo or on a customer-pay job', () => {
    const q = recallQuote(createRng(3))
    expect(clientJob('client-1-1', 'recall', 'c1', q, client, true).warranty).toBe(0)
    expect(
      clientJob('client-1-1', 'oil', 'c1', quote('oil', 'standard', createRng(3)), client).warranty,
    ).toBe(0)
  })

  it('comes after clients’ jobs and before our own reconditioning', () => {
    expect(jobPriority({ kind: 'oil' })).toBeLessThan(jobPriority({ kind: 'recall' }))
    expect(jobPriority({ kind: 'recall' })).toBeLessThan(jobPriority({ kind: 'recon' }))
  })
})
