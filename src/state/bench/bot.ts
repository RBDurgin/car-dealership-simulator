import { CLOCK_STEP_MINUTES, CLOSE_MINUTE, OPEN_MINUTE } from '../../sim/clock'
import { CAR_MODELS, PLAYER_ID } from '../../sim/customers'
import { customerActions, dealCustomer } from '../../sim/deal'
import { EXPANSIONS } from '../../sim/expansions'
import { answerFor, loanDeclined, productsFor } from '../../sim/fi'
import { MAX_MARKUP } from '../../sim/lenders'
import type { ActionId } from '../../sim/interactables'
import { MANAGER_DESK, type ExpansionId } from '../../sim/layout'
import { PROMPTS_PER_DRIVE, topicFit } from '../../sim/talkingPoints'
import type { Role } from '../../sim/staff'
import { driveBlocker } from '../../sim/testDrive'
import { useGame } from '../store'

/**
 * A headless player for the long-game bench: it stands in for the scene and
 * the player, so the store runs whole days with no renderer. It isn't a good
 * player, only a busy one: walkers get where they're going at once, the
 * player works one deal at a time, gives a test drive to anyone who asks (back
 * at once, see `setDriveStyle`), takes every counter and runs a fair F&I
 * menu at their own desk (or a hard one, see `setMenuStyle`), and stock and
 * ads are bought each morning. With a staff style (see `setStaffStyle`) it
 * keeps a small team, who come in and stand idle, as their work is the
 * scene's; by default it hires nobody. Every choice
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

/**
 * How the bot takes test drives: `plain` (the default) answers no talking
 * points, `good` and `poor` answer each with the best or worst fit offered,
 * `cut` heads back at once, and `none` never drives, giving a price instead.
 */
export type DriveStyle = 'plain' | 'good' | 'poor' | 'cut' | 'none'
let driveStyle: DriveStyle = 'plain'

export function setDriveStyle(style: DriveStyle): void {
  driveStyle = style
}

const FIT_RANK = { good: 2, ok: 1, poor: 0 }

/** Answers the talking point up now with the best (or worst) fit offered. */
function pointOut(customerId: string, best: boolean): void {
  const c = game().customers.find((x) => x.id === customerId)
  const car = c?.drive && game().inventory.find((x) => x.id === c.drive!.carId)
  const offered = c?.drive?.offered
  if (!c || !car || !offered) return
  const rank = (i: number) => FIT_RANK[topicFit(c, car, offered[i])] * (best ? 1 : -1)
  let pick = 0
  for (let i = 1; i < offered.length; i++) if (rank(i) > rank(pick)) pick = i
  game().pickTopic(pick)
}

/** Takes `c` for the test drive they asked for: in the car, round the block and back at once. */
function testDrive(customerId: string): void {
  game().testDrive(customerId)
  const id = game().activeAction?.id
  if (id === undefined) return
  game().arriveAction(id)
  game().completeAction(id)
  if (driveStyle === 'cut') game().headBack()
  else if (driveStyle === 'good' || driveStyle === 'poor') {
    for (let i = 0; i < PROMPTS_PER_DRIVE; i++) {
      game().drivePrompt(customerId)
      pointOut(customerId, driveStyle === 'good')
    }
  }
  game().driveBack(customerId)
}

/** Takes a buyer to the player's own desk, and through the F&I menu to sign. */
function closeDeal(customerId: string): void {
  game().requestAction(MANAGER_DESK.chairId, 'closeDeal')
  const id = game().activeAction?.id
  if (id === undefined) return
  game().dispatchCustomer({ type: 'seat', id: customerId })
  game().arriveAction(id)
  game().completeAction(id)
  runMenu()
}

/**
 * How the bot runs the F&I menu: `fair` (the default) as below, `hard` at
 * the most markup with every product presented at its top price, and again
 * at its low one after a no.
 */
export type MenuStyle = 'fair' | 'hard'
let menuStyle: MenuStyle = 'fair'

export function setMenuStyle(style: MenuStyle): void {
  menuStyle = style
}

/**
 * The F&I menu played fairly: a point of markup, then the warranty and (on
 * a loan) GAP at their low prices. A buyer no lender takes puts more down,
 * or goes home. Played hard (see `MenuStyle`), it pushes everything.
 */
function runMenu(): void {
  const c = dealCustomer(game().customers, PLAYER_ID)
  if (c?.phase !== 'menu' || !c.fi) return
  if (loanDeclined(c, c.fi)) game().fiMoreDown()
  const fi = dealCustomer(game().customers, PLAYER_ID)?.fi
  if (!fi || loanDeclined(c, fi)) return game().fiLetGo()
  if (menuStyle === 'hard') {
    if (fi.lender) game().fiLender(fi.lender, MAX_MARKUP)
    for (const p of productsFor(c)) {
      game().fiPresent(p.id, p.high)
      const deal = dealCustomer(game().customers, PLAYER_ID)?.fi
      if (deal && !answerFor(deal, p.id)?.taken) game().fiPresent(p.id, p.low)
    }
    return game().fiSign()
  }
  if (fi.lender) game().fiLender(fi.lender, 1)
  for (const p of productsFor(c)) {
    if (p.id === 'warranty' || p.id === 'gap') game().fiPresent(p.id, p.low)
  }
  game().fiSign()
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
    if (driveStyle !== 'none' && c.wantsDrive && !driveBlocker(c, game().inventory)) {
      testDrive(c.id)
      return true
    }
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
 * How the bot treats its staff: `none` (the default) hires nobody; `fair`
 * keeps one of each of `BOT_ROLES` on the auto rota, grants every raise and
 * holds the morning huddle; `neglect` keeps the same team working every day
 * and declines every raise.
 */
export type StaffStyle = 'none' | 'fair' | 'neglect'
let staffStyle: StaffStyle = 'none'

export function setStaffStyle(style: StaffStyle): void {
  staffStyle = style
}

/** The roles the bot keeps one of, with a staff style. */
export const BOT_ROLES: readonly Role[] = ['sales', 'porter', 'receptionist']

/**
 * The morning's staff work, with a staff style: fills an empty role from
 * today's applicants, answers raise requests, brings everyone working
 * today to their post and (fair) holds the huddle, or (neglect) takes away
 * their days off from tomorrow.
 */
function manageStaff(): void {
  if (staffStyle === 'none') return
  for (const role of BOT_ROLES) {
    if (game().roster.some((e) => e.role === role && !e.fired)) continue
    const c = game().candidates.find((x) => x.role === role)
    if (c) game().hire(c.id)
  }
  for (const e of game().roster) {
    if (e.fired) continue
    if (e.raiseAsk) game().answerRaise(e.id, staffStyle === 'fair')
    if (staffStyle === 'neglect') for (const w of e.daysOff) game().toggleDayOff(e.id, w)
    if (e.status === 'arriving') game().dispatchStaff({ type: 'atPost', id: e.id })
  }
  if (staffStyle === 'fair') perform(MANAGER_DESK.chairId, 'huddle')
}

/**
 * The morning's shopping, while there's cash: buys each expansion it can,
 * keeps an online ad running and refills the lot.
 */
function morning(): void {
  manageStaff()
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
