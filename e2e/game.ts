import { expect, type Page } from '@playwright/test'
import type { Difficulty } from '../src/sim/difficulty'
import type { useGame } from '../src/state/store'

type Store = typeof useGame
type State = ReturnType<Store['getState']>

/**
 * Collects page errors and console errors, for a test to assert there were
 * none. Call before `startGame`.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

/** Opens the game and starts a new one at `level`, past the how-to-play guide. */
export async function startGame(page: Page, level: Difficulty = 'medium'): Promise<void> {
  await page.goto('/')
  await page.getByText('New game').click()
  const label = level[0].toUpperCase() + level.slice(1)
  // Not exact: the button holds the level's blurb too.
  await page.getByText(label).first().click()
  // A new game opens the guide, which pauses the clock.
  await page.getByText("Let's go").click()
  await expect.poll(() => inStore(page, (_, g) => g().screen)).toBe('playing')
}

/**
 * Runs `fn` in the page with the game's store: Vite serves the source, so the
 * import is the same instance the game uses. `fn` is serialised, so it can
 * only use its arguments.
 */
export function inStore<T, A = undefined>(
  page: Page,
  fn: (useGame: Store, g: () => State, arg: A) => T | Promise<T>,
  arg?: A,
): Promise<T> {
  return page.evaluate(
    async ([source, a]) => {
      const { useGame } = await import('/src/state/store.ts')
      const run = new Function(`return (${source})`)()
      return run(useGame, useGame.getState, a)
    },
    [fn.toString(), arg] as const,
  ) as Promise<T>
}

/**
 * Brings in visitors at the next clock step until one of them drove in, and
 * returns their id.
 */
export function forceDriveIn(page: Page): Promise<string> {
  return inStore(page, (useGame, g) => {
    for (let i = 0; i < 40; i++) {
      const driver = g().customers.find((c) => c.vehicle)
      if (driver) return driver.id
      const m = g().clock.minute + 10
      useGame.setState({
        arrivals: { minutes: [m, m], sources: ['regular', 'regular'], spawned: 0 },
      })
      g().tickClock({ day: g().clock.day, minute: m })
    }
    throw new Error('Nobody drove in')
  })
}
