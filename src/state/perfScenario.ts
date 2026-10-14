import { STAFF_VARIANTS } from '../sim/characters'
import { CLOSE_MINUTE } from '../sim/clock'
import { CAR_MODELS } from '../sim/customers'
import type { ExpansionId } from '../sim/layout'
import { roleLimits, ROLES, type Employee } from '../sim/staff'
import { useGame } from './store'
import { subscribeTo } from './subscribe'

/** Every expansion, so the lot, the wing and the garage are all up. */
const EXPANSION_IDS: readonly ExpansionId[] = ['east-lot', 'showroom-wing', 'service-bay']

/** Customers spawned at once on the busy morning. */
export const BUSY_CUSTOMERS = 12

/**
 * The busy late-game day the perf numbers are taken on (`docs/PERF.md`):
 * every expansion up, every space filled, a full staff, rain, Nazma on his
 * way and a crowd of customers. Played from a new game on day 1: it buys
 * everything, ends the day so the cars are delivered and the staff come in,
 * then sets up the next morning. Used by `?perf=busy` (`main.tsx`, where
 * nothing is saved) and the `@perf` e2e scenario, so the two measure the
 * same scene.
 */
export function busyDay(): void {
  const g = useGame.getState
  const limits = roleLimits([...EXPANSION_IDS])
  const roster: Employee[] = ROLES.flatMap((role) =>
    Array.from({ length: limits[role] }, (_, i) => ({
      id: `perf-${role}-${i}`,
      name: `Perf ${role} ${i + 1}`,
      variant: STAFF_VARIANTS[i % STAFF_VARIANTS.length],
      role,
      skill: 3,
      wage: 150,
      status: 'off' as const,
      fired: false,
      quitting: false,
      xp: 0,
      potential: 5,
      hiredDay: 1,
      raiseAsk: null,
    })),
  )
  useGame.setState({
    cash: 5_000_000,
    franchise: 'gold',
    expansions: EXPANSION_IDS.map((id) => ({ id, day: 0 })),
    roster,
    helpOpen: false,
  })
  // Fill every space the expansions open, then end the day so it's delivered.
  for (let i = 0; g().orderCar(CAR_MODELS[i % CAR_MODELS.length], 'cash'); i++);
  useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
  g().tickClock({ day: g().clock.day, minute: CLOSE_MINUTE })
  for (const c of g().customers) g().dispatchCustomer({ type: 'despawn', id: c.id })
  for (const e of g().roster) g().dispatchStaff({ type: 'left', id: e.id })
  g().startNextDay()

  // The morning: rain, Nazma coming for three lot cars, and a crowd.
  const lot = g()
    .inventory.filter((c) => c.status === 'available')
    .slice(-3)
  useGame.setState({
    weather: 'rain',
    notice: null,
    nazma: {
      scheme: 'smudge',
      targets: lot.map((c) => c.id),
      arrivalMinute: g().clock.minute + 20,
      status: 'coming',
      progress: 0,
      chatting: false,
    },
  })
  g().devSpawnCustomers(BUSY_CUSTOMERS)
}

/**
 * Runs `busyDay` once, as soon as a new game starts (day 1 opening), for
 * `?perf=busy`. Continuing a save isn't touched.
 */
export function startBusyDay(): () => void {
  const unsubscribe = subscribeTo(
    (s) => s.screen,
    (screen, _prev, s) => {
      if (screen !== 'playing' || s.clock.day !== 1) return
      unsubscribe()
      // After this set has reached every listener, so none sees the states out of order.
      queueMicrotask(busyDay)
    },
  )
  return unsubscribe
}
