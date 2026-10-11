import { CLOCK_STEP_MINUTES, CLOSE_MINUTE, OPEN_MINUTE } from '../../sim/clock'
import { CAR_MODELS, PLAYER_ID } from '../../sim/customers'
import { customerActions, dealCustomer } from '../../sim/deal'
import { EXPANSIONS } from '../../sim/expansions'
import type { ActionId } from '../../sim/interactables'
import type { ExpansionId } from '../../sim/layout'
import { useGame } from '../store'

/**
 * A headless player for the long-game bench: it stands in for the scene and
 * the player, so the store runs whole days with no renderer. It isn't a good
 * player, only a busy one: walkers get where they're going at once, the
 * player works one deal at a time and takes every counter, and stock and ads
 * are bought each morning. Staff stand idle, as their work is the scene's. Every choice
 * is fixed, and the store's rngs are seeded by the day, so a run with the same
 * level plays the same each time.
 */

const game = () => useGame.getState()

/** Store sets that ran the listeners, counted to report sets per clock step. */
let sets = 0
useGame.subscribe(() => {
  sets++
})

/** Cash the bot keeps before it pays for an ad. */
const AD_CASH = 20_000

/** Asks, signings and greetings the player gets through in one clock step. */
const PLAYER_STEPS = 4

/** Cash above which stock is bought outright rather than on the floor plan. */
const CASH_BUY = 150_000

/** Runs a player action to the end, as the walk and the timers would. */
function perform(targetId: string, action: ActionId): void {
  game().requestAction(targetId, action)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
}

/** Takes a buyer to the office desk and signs them. */
function closeDeal(customerId: string): void {
  game().requestAction('office-chair', 'closeDeal')
  const id = game().activeAction?.id
  if (id === undefined) return
  game().dispatchCustomer({ type: 'seat', id: customerId })
  game().arriveAction(id)
  game().completeAction(id)
}

/**
 * Moves each customer on a step, as the scene would once they've walked
 * there: in from the road, past the cars, home again, and to their car once
 * the garage has it ready.
 */
function moveCustomers(): void {
  for (const { id } of game().customers) {
    const c = game().customers.find((x) => x.id === id)
    if (!c) continue
    if (c.phase === 'leaving') {
      game().dispatchCustomer({ type: c.vehicle || c.service ? 'droveOff' : 'despawn', id })
    } else if (c.phase === 'arriving') {
      const drove = (c.vehicle && !c.vehicle.parked) || c.service
      game().dispatchCustomer({ type: drove ? 'parked' : 'arrive', id })
    } else if (c.phase === 'browsing' && !c.service) {
      game().dispatchCustomer({ type: 'browsed', id })
    } else if (c.phase === 'servicing') {
      const job = game().serviceJobs.find((j) => j.id === c.service?.jobId)
      if (job?.readyMinute != null) game().serviceCollect(id)
    }
  }
}

/**
 * Takes the player's deal one step on: asks (taking their counter as it
 * stands, or the suggested price first) or signs a buyer. Returns false when
 * the player has no deal going.
 */
function workDeal(): boolean {
  const c = dealCustomer(game().customers, PLAYER_ID)
  if (!c) return false
  if (c.phase === 'following') closeDeal(c.id)
  else if (c.phase === 'talking') {
    const h = c.haggle
    if (h) game().ask(h.counter + (h.allowance ?? 0), h.allowance)
    else perform(c.id, 'offer')
    game().answerOffer(c.id)
  } else game().walkAway()
  return true
}

/** Greets, or checks in, the first customer who's waiting for the player. */
function greetNext(): boolean {
  const jobs = game().serviceJobs
  for (const c of game().customers) {
    const action = customerActions(c, jobs).find(
      (a) => a === 'greet' || a === 'makeOffer' || a === 'checkIn',
    )
    if (!action) continue
    perform(c.id, action)
    // A service client answers the quote at once.
    if (action === 'checkIn') game().answerOffer(c.id)
    return true
  }
  return false
}

/**
 * One clock step's worth of the player: the customers move on, then the
 * player works one deal at a time, as a person would, for a few steps.
 */
function serveCustomers(): void {
  moveCustomers()
  for (let i = 0; i < PLAYER_STEPS; i++) {
    if (!workDeal() && !greetNext()) break
  }
}

/**
 * The morning's shopping, while there's cash: buys each expansion it can,
 * keeps an online ad running and refills the lot.
 */
function morning(): void {
  if (game().cash <= 0) return
  for (const id of Object.keys(EXPANSIONS) as ExpansionId[]) game().buyExpansion(id)
  const day = game().clock.day
  if (game().cash > AD_CASH && !game().campaigns.some((c) => c.endDay >= day)) {
    game().launchCampaign('online')
  }
  // A few models a day while there's room. Models the franchise tier
  // doesn't sell yet are refused and skipped.
  for (let i = 0; i < CAR_MODELS.length; i++) {
    const model = CAR_MODELS[(game().clock.day + i) % CAR_MODELS.length]
    game().orderCar(model, game().cash > CASH_BUY ? 'cash' : 'floor')
  }
}

/** Steps the clock to closing time, then sees everyone and everyone's staff out. */
export function playDay(onTick?: (ms: number, sets: number) => void): void {
  const day = game().clock.day
  morning()
  for (let minute = OPEN_MINUTE + CLOCK_STEP_MINUTES; minute <= CLOSE_MINUTE;) {
    const before = sets
    const t = performance.now()
    game().tickClock({ day, minute })
    onTick?.(performance.now() - t, sets - before)
    serveCustomers()
    minute += CLOCK_STEP_MINUTES
  }
  // Closing: whoever's left heads out, then the staff go home.
  for (let i = 0; i < 4 && game().customers.length > 0; i++) serveCustomers()
  for (const c of game().customers) {
    game().dispatchCustomer({ type: c.vehicle || c.service ? 'droveOff' : 'despawn', id: c.id })
  }
  for (const e of game().roster) game().dispatchStaff({ type: 'left', id: e.id })
}

/** Opens the next day, and gives the store sets it took. */
export function nextDay(): number {
  const before = sets
  game().startNextDay()
  return sets - before
}
