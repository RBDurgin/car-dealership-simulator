import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { PerfSample } from '../src/state/perf'
import { inStore, watchErrors } from './game'

/**
 * The browser perf scenario (`npm run e2e:perf`, left out of `npm run e2e`):
 * the busy late-game day `?perf=busy` starts (every expansion up, a full
 * lot, a full staff, 12 customers, rain and Nazma on his way), run for 30 s
 * at 1× and at 4× with the `?perf` overlay. The overlay's readings are averaged into
 * `e2e/perf-results.json`, with React's commits, renders and render time per game
 * minute (`countRenders`); the numbers go in `docs/PERF.md`.
 */

const SECONDS = 30
/** `BUSY_CUSTOMERS` in `state/perfScenario.ts` (not imported: it pulls in the store). */
const BUSY_CUSTOMERS = 12
/** How often the overlay is read, in ms. */
const SAMPLE_MS = 1000

interface Phase {
  speed: number
  samples: number
  fps: number
  p95: number
  calls: { mean: number; max: number }
  triangles: number
  geometries: number
  textures: number
  setsPerSecond: number
  listenerMs: number
  walkers: number
  html: number
  heapMB: number | null
  /** React's work per game minute (dev build): commits, components rendered and render ms. */
  react: { commits: number; renders: number; renderMs: number }
}

/** What `countRenders` has counted so far. */
interface RenderCounts {
  commits: number
  renders: number
  renderMs: number
}

/**
 * Counts React's commits, the components each one rendered and their render
 * time, through the hook React DevTools uses (installed before the page
 * loads). Components a commit didn't visit keep their old flags, so a subtree
 * whose children didn't change isn't walked, as DevTools does.
 */
async function countRenders(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Fiber {
      tag: number
      flags: number
      alternate: Fiber | null
      child: Fiber | null
      sibling: Fiber | null
    }
    // Function, forwardRef and memo components; PerformedWork is flag 1.
    const COMPONENT_TAGS = [0, 11, 14, 15]
    const counts = { commits: 0, renders: 0, renderMs: 0 }
    const walk = (fiber: Fiber | null) => {
      for (let f = fiber; f; f = f.sibling) {
        if (COMPONENT_TAGS.includes(f.tag) && (f.flags & 1) === 1) counts.renders++
        if (!(f.alternate && f.child === f.alternate.child)) walk(f.child)
      }
    }
    let renderers = 0
    Object.assign(window, {
      __renderCounts: counts,
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        supportsFiber: true,
        isDisabled: false,
        renderers: new Map(),
        inject: () => ++renderers,
        checkDCE: () => {},
        onScheduleFiberRoot: () => {},
        onCommitFiberUnmount: () => {},
        onPostCommitFiberRoot: () => {},
        onCommitFiberRoot: (_: number, root: { current: Fiber & { actualDuration?: number } }) => {
          counts.commits++
          counts.renderMs += root.current.actualDuration ?? 0
          walk(root.current.child)
        },
      },
    })
  })
}

/** The render counts so far and the game's minute. */
function readRenders(page: Page): Promise<RenderCounts & { minute: number }> {
  return inStore(page, (_, g) => ({
    ...(window as unknown as { __renderCounts: RenderCounts }).__renderCounts,
    minute: g().clock.minute,
  }))
}

/**
 * Starts a new game with `?perf=busy`, which jumps to the busy day of
 * `state/perfScenario.ts` (and skips the guide), and waits for the crowd.
 */
async function busyDay(page: Page): Promise<void> {
  await page.goto('/?perf=busy')
  await page.getByText('New game').click()
  await page.getByText('Medium').first().click()
  await expect
    .poll(() => inStore(page, (_, g) => g().customers.length))
    .toBeGreaterThanOrEqual(BUSY_CUSTOMERS)
}

/** Reads the overlay once a second for `SECONDS` at `speed`, and averages the readings. */
async function measure(page: Page, speed: number): Promise<Phase> {
  await inStore(page, (useGame, _, s) => useGame.setState({ timeScale: s }), speed)
  const samples: { s: PerfSample; heap: number | null }[] = []
  const start = await readRenders(page)
  for (let t = 0; t < SECONDS * 1000; t += SAMPLE_MS) {
    await page.waitForTimeout(SAMPLE_MS)
    const reading = await page.evaluate(async () => {
      const { perfReading } = await import('/src/state/perf.ts')
      const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory
      return { s: perfReading.latest, heap: memory ? memory.usedJSHeapSize : null }
    })
    if (reading.s) samples.push({ s: reading.s, heap: reading.heap })
  }
  const end = await readRenders(page)
  expect(samples.length).toBeGreaterThan(0)
  const minutes = Math.max(1, end.minute - start.minute)
  const perMinute = (k: keyof RenderCounts) => Number(((end[k] - start[k]) / minutes).toFixed(2))
  const mean = (f: (s: PerfSample) => number) =>
    Number((samples.reduce((a, x) => a + f(x.s), 0) / samples.length).toFixed(2))
  const heaps = samples.flatMap((x) => (x.heap === null ? [] : [x.heap]))
  return {
    speed,
    samples: samples.length,
    fps: mean((s) => s.fps),
    p95: mean((s) => s.p95),
    calls: { mean: mean((s) => s.calls), max: Math.max(...samples.map((x) => x.s.calls)) },
    triangles: mean((s) => s.triangles),
    geometries: mean((s) => s.geometries),
    textures: mean((s) => s.textures),
    setsPerSecond: mean((s) => s.setsPerSecond),
    listenerMs: mean((s) => s.listenerMs),
    walkers: mean((s) => s.walkers),
    html: mean((s) => s.html),
    heapMB: heaps.length ? Number((Math.max(...heaps) / 2 ** 20).toFixed(1)) : null,
    react: {
      commits: perMinute('commits'),
      renders: perMinute('renders'),
      renderMs: perMinute('renderMs'),
    },
  }
}

test('a busy late-game day', { tag: '@perf' }, async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const errors = watchErrors(page)
  await countRenders(page)
  await busyDay(page)
  const state = await inStore(page, (_, g) => ({
    cars: g().inventory.length,
    staff: g().roster.length,
    customers: g().customers.length,
    weather: g().weather,
  }))
  expect(state).toMatchObject({ staff: 12, weather: 'rain' })
  const phases = [await measure(page, 1), await measure(page, 4)]
  const result = { at: new Date().toISOString(), state, phases }
  // To compare the look before and after a rendering change (18e).
  await page.screenshot({ path: 'test-results/perf-busy.png' })
  writeFileSync('e2e/perf-results.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))

  // Closing: the summary shows the day's readings, ready for docs/PERF.md.
  // On a landscape phone's screen, where it must be in view without scrolling.
  await page.setViewportSize({ width: 844, height: 390 })
  // The scene's clock is set too, or its next step would set the store's back.
  await inStore(page, async (useGame) => {
    const { CLOSE_MINUTE } = await import('/src/sim/clock.ts')
    const { gameTime } = await import('/src/scene/runtime.ts')
    gameTime.minute = CLOSE_MINUTE
    useGame.setState({ timeScale: 1 })
    useGame.getState().tickClock({ day: useGame.getState().clock.day, minute: CLOSE_MINUTE })
  })
  // Everyone heads home, mid-deal or not, until the day settles.
  await expect
    .poll(
      () =>
        inStore(page, (_, g) => {
          for (const c of g().customers) {
            g().dispatchCustomer({
              type: c.vehicle || c.service ? 'droveOff' : 'despawn',
              id: c.id,
            })
          }
          return g().dayStats.settled
        }),
      { timeout: 60_000 },
    )
    .toBe(true)
  const report = page.locator('.perf-report pre')
  await expect(report).toBeInViewport({ ratio: 1 })
  await expect(report).toContainText(/\| Desktop, Chrome, busy day \| 1× \|/)
  await expect(report).toContainText(/\| 4× \|/)
  await expect(report).toContainText(/Geometries \d+ → \d+/)
  await expect(page.getByText('Not saved: a ?perf=busy game never is.')).toBeVisible()
  await page.screenshot({ path: 'test-results/perf-report.png' })
  // A busy game is never saved.
  const keys = await page.evaluate(() => Object.keys(localStorage))
  expect(keys).not.toContain('car-dealership-simulator.save')
  expect(keys).not.toContain('dealership.trophies')
  expect(errors).toEqual([])
})
