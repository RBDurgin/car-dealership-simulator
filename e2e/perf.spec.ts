import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { PerfSample } from '../src/state/perf'
import { inStore, watchErrors } from './game'

/**
 * The browser perf scenario (`npm run e2e:perf`, left out of `npm run e2e`):
 * the busy late-game day `?perf=busy` starts (every expansion up, a full
 * lot, a full staff, 12 customers, rain and Nazma on his way), run for 30 s
 * at 1× and at 4× with the `?perf` overlay. The overlay's readings are averaged into
 * `e2e/perf-results.json`; the numbers go in `docs/PERF.md`.
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
  for (let t = 0; t < SECONDS * 1000; t += SAMPLE_MS) {
    await page.waitForTimeout(SAMPLE_MS)
    const reading = await page.evaluate(async () => {
      const { perfReading } = await import('/src/state/perf.ts')
      const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory
      return { s: perfReading.latest, heap: memory ? memory.usedJSHeapSize : null }
    })
    if (reading.s) samples.push({ s: reading.s, heap: reading.heap })
  }
  expect(samples.length).toBeGreaterThan(0)
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
  }
}

test('a busy late-game day', { tag: '@perf' }, async ({ page }) => {
  test.setTimeout(5 * 60_000)
  const errors = watchErrors(page)
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
