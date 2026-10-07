import { expect, test } from '@playwright/test'
import { forceDriveIn, inStore, startGame, watchErrors } from './game'

test('starts a new game without errors', async ({ page }) => {
  const errors = watchErrors(page)
  await startGame(page, 'easy')
  const state = await inStore(page, (_, g) => ({
    day: g().clock.day,
    difficulty: g().difficulty,
    cars: g().inventory.length,
  }))
  expect(state).toEqual({ day: 1, difficulty: 'easy', cars: expect.any(Number) })
  expect(state.cars).toBeGreaterThan(0)
  // The scene drew something: the canvas is there and sized.
  const box = await page.locator('canvas').first().boundingBox()
  expect(box?.width).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('opens the office computer with I and closes it with Escape', async ({ page }) => {
  await startGame(page)
  const panel = page.getByRole('dialog', { name: 'Office computer' })
  await page.keyboard.press('KeyI')
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
})

test('a visitor drives in, parks, and drives off again', async ({ page }) => {
  const errors = watchErrors(page)
  await startGame(page)
  const id = await forceDriveIn(page)
  // ×4, or the drive in takes about 40 s here.
  await page.keyboard.press('KeyT')

  const parked = () =>
    inStore(page, (_, g, cid) => g().customers.find((c) => c.id === cid)?.vehicle?.parked, id)
  await expect.poll(parked, { timeout: 60_000 }).toBe(true)
  // Positions live in the scene's runtime, not the store.
  const atCar = await page.evaluate(async (cid) => {
    const rt = await import('/src/scene/runtime.ts')
    return { car: rt.vehiclePos.has(cid), driver: rt.customerPos.has(cid) }
  }, id)
  expect(atCar).toEqual({ car: true, driver: true })

  // Sent home, they walk back to the car and it leaves the map.
  await inStore(
    page,
    (useGame, g, cid) =>
      useGame.setState({
        customers: g().customers.map((c) =>
          c.id === cid ? { ...c, phase: 'leaving', leaveReason: 'impatient', handlerId: null } : c,
        ),
      }),
    id,
  )
  const gone = () =>
    page.evaluate(async (cid) => {
      const { useGame } = await import('/src/state/store.ts')
      const rt = await import('/src/scene/runtime.ts')
      return !useGame.getState().customers.some((c) => c.id === cid) && !rt.vehiclePos.has(cid)
    }, id)
  await expect.poll(gone, { timeout: 90_000 }).toBe(true)
  expect(errors).toEqual([])
})

test('closing an empty lot shows the day summary and starts the next day', async ({ page }) => {
  const errors = watchErrors(page)
  await startGame(page)
  // Nobody else turns up, and the doors shut.
  await inStore(page, (useGame, g) => {
    useGame.setState({ customers: [], arrivals: { minutes: [], sources: [], spawned: 0 } })
    g().tickClock({ day: 1, minute: 18 * 60 })
  })
  const summary = page.getByRole('dialog', { name: /summary/ })
  await expect(summary).toBeVisible()
  await expect(summary.getByText('Progress saved.')).toBeVisible()
  await summary.getByRole('button', { name: 'Start day 2' }).click()
  await expect.poll(() => inStore(page, (_, g) => g().clock.day)).toBe(2)
  expect(errors).toEqual([])
})
