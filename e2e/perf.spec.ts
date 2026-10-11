import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { PerfSample } from '../src/state/perf'
import { inStore, startGame, watchErrors } from './game'

/**
 * The browser perf scenario (`npm run e2e:perf`, left out of `npm run e2e`):
 * a busy late game (every expansion up, a full lot, a full staff, 12
 * customers, rain and Nazma on his way), run for 30 s at 1× and at 4× with
 * the `?perf` overlay. The overlay's readings are averaged into
 * `e2e/perf-results.json`; the numbers go in `docs/PERF.md`.
 */

const SECONDS = 30
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

/** Builds the busy day: everything bought, then a day ended so it all arrives. */
async function busyDay(page: Page): Promise<void> {
  await inStore(page, async (useGame, g) => {
    const { roleLimits, ROLES } = await import('/src/sim/staff.ts')
    const { STAFF_VARIANTS } = await import('/src/sim/characters.ts')
    const { CLOSE_MINUTE } = await import('/src/sim/clock.ts')
    const { CAR_MODELS } = await import('/src/sim/customers.ts')
    const ids = ['east-lot', 'showroom-wing', 'service-bay'] as const
    const limits = roleLimits([...ids])
    const roster = ROLES.flatMap((role) =>
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
      })),
    )
    useGame.setState({
      cash: 5_000_000,
      franchise: 'gold',
      expansions: ids.map((id) => ({ id, day: 0 })),
      roster,
    })
    // Fill every space the expansions open, then end the day so it's delivered.
    for (let i = 0; g().orderCar(CAR_MODELS[i % CAR_MODELS.length], 'cash'); i++);
    useGame.setState({ arrivals: { minutes: [], sources: [], spawned: 0 } })
    g().tickClock({ day: g().clock.day, minute: CLOSE_MINUTE })
    for (const c of g().customers) g().dispatchCustomer({ type: 'despawn', id: c.id })
    for (const e of g().roster) g().dispatchStaff({ type: 'left', id: e.id })
    g().startNextDay()
  })
  // The morning: rain, Nazma coming for three lot cars, and a crowd.
  await inStore(page, (useGame, g) => {
    const lot = g()
      .inventory.filter((c) => c.status === 'available')
      .slice(-3)
    useGame.setState({
      weather: 'rain',
      helpOpen: false,
      nazma: {
        scheme: 'smudge',
        targets: lot.map((c) => c.id),
        arrivalMinute: g().clock.minute + 20,
        status: 'coming',
        progress: 0,
        chatting: false,
      },
    })
    g().devSpawnCustomers(12)
  })
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
  await startGame(page, 'medium', '/?perf')
  await busyDay(page)
  const state = await inStore(page, (_, g) => ({
    cars: g().inventory.length,
    staff: g().roster.length,
    customers: g().customers.length,
    weather: g().weather,
  }))
  expect(state.customers).toBeGreaterThanOrEqual(12)
  const phases = [await measure(page, 1), await measure(page, 4)]
  const result = { at: new Date().toISOString(), state, phases }
  // To compare the look before and after a rendering change (18e).
  await page.screenshot({ path: 'test-results/perf-busy.png' })
  writeFileSync('e2e/perf-results.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  expect(errors).toEqual([])
})
