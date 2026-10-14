import { isClosed, startOfDay, toStep } from '../../sim/clock'
import { generateCustomer, patienceDrain, reduceCustomers } from '../../sim/customers'
import { recordVisitors } from '../../sim/deal'
import { assignVehicles } from '../../sim/driving'
import { availableCars } from '../../sim/inventory'
import { assignSellers } from '../../sim/sellers'
import { stampReady, workJobs } from '../../sim/service'
import { takeDue } from '../../sim/spawner'
import { patienceFactor } from '../../sim/staff'
import { mechanicWorking } from '../../sim/staffAi'
import { assignTrades } from '../../sim/tradeIns'
import { WEATHER_EFFECTS, waitingOutside } from '../../sim/weather'
import { arrivalOpts, commit, tallyMissed, tuning, upEffects, type Kit } from '../core'
import { nextCustomerId, rng } from '../rng'
import type { GameState } from '../types'
import { clientArrivals, receptionCalls } from './clients'
import { withQuotes, withShopperRolls } from './customers'
import { closeUp } from './day'
import { creditJobs, jobsDone, serviceArrivals } from './service'

type ClockKeys = 'clock' | 'tickClock'

/** The game clock, and what each 10-minute step of it brings. (Today's arrivals come with `dayOne`.) */
export function clockSlice(k: Kit): Pick<GameState, ClockKeys> {
  return {
    clock: startOfDay(1),
    // One step of the clock is stored with one `set`.
    tickClock: (t) => k.batch(() => tick(k, toStep(t))),
  }
}

/**
 * One step of the clock: waiting customers lose patience, new ones arrive,
 * the mechanics put in the time, at closing everyone heads out (`commit`
 * applies the close) and the receptionist works the phone.
 */
function tick(k: Kit, step: ReturnType<typeof toStep>): void {
  const { get, set } = k
  const s = get()
  if (step.day === s.clock.day && step.minute === s.clock.minute) return
  const minutes = step.day === s.clock.day ? step.minute - s.clock.minute : 0
  // A receptionist keeps waiting customers company, and a comfy waiting
  // area keeps them happy, so they last longer. Rain and heat wear down
  // those left waiting out on the lot.
  const except = s.activeAction?.targetId
  const drain = patienceDrain(minutes, patienceFactor(s.roster), upEffects(k).patienceSaved)
  const outsideFactor = WEATHER_EFFECTS[s.weather].lotPatience
  let customers = reduceCustomers(s.customers, {
    type: 'tick',
    minutes: drain,
    except,
    ...(outsideFactor !== 1 && {
      outside: waitingOutside(s.customers, s.inventory),
      outsideFactor,
    }),
  })
  const { schedule, due } = takeDue(s.arrivals, step.minute)
  // Clients on an appointment come first, and get first pick of the parking.
  // Loyal clients come straight to us; the rest may have seen Nazma's prices.
  const booked = withShopperRolls(k, withQuotes(k, clientArrivals(k, step.minute, customers)))
  customers = [...customers, ...booked]
  const stock = availableCars(s.inventory)
  // Some drive in, while there's room in customer parking. Some of those
  // are sellers, and some of the rest bring a car to trade.
  const level = tuning(k)
  const arrived = withShopperRolls(
    k,
    withQuotes(
      k,
      assignTrades(
        assignSellers(
          assignVehicles(
            due.map((source) =>
              generateCustomer(nextCustomerId(), stock, rng.customer, {
                source,
                ...arrivalOpts(k),
              }),
            ),
            customers,
            rng.drive,
            step.day,
            s.purchases.map((p) => p.spot),
          ),
          rng.drive,
          step.day,
          { hope: level.sellerHope, noise: level.appraisalNoise },
        ),
        rng.drive,
        step.day,
        { hope: level.tradeHope, noise: level.appraisalNoise },
      ),
    ),
  )
  const service = serviceArrivals(k, step, customers)
  customers = [...customers, ...arrived, ...service.arrived]
  const visitors = [...booked, ...arrived]
  // The mechanics put in the time on what's in the bays.
  const jobs = stampReady(
    workJobs(s.serviceJobs, minutes, (id) => mechanicWorking(s.roster, id)),
    step.minute,
  )
  set({
    clock: step,
    arrivals: schedule,
    dayStats: tallyMissed(k, recordVisitors(get().dayStats, visitors), visitors),
    serviceJobs: jobs,
    serviceVisits: service.schedule,
    serviceAway: service.away,
    serviceComebacks: service.comebacks,
  })
  if (jobs !== s.serviceJobs) {
    creditJobs(
      k,
      s.serviceJobs.filter((j, i) => j.status === 'inBay' && jobs[i].status !== 'inBay'),
    )
    jobsDone(
      k,
      jobs.filter((j, i) => j.status !== s.serviceJobs[i].status),
    )
  }
  if (isClosed(step)) closeUp(k)
  // Settles the day too, once the doors are shut and the lot is empty.
  commit(k, customers)
  receptionCalls(k, minutes)
}
