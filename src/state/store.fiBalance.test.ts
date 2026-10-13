import { beforeAll, describe, expect, it } from 'vitest'
import { rollChargebacks } from '../sim/chargebacks'
import { rollCredit } from '../sim/credit'
import { generateCustomer } from '../sim/customers'
import { saleFi, staffMenu } from '../sim/fi'
import { buildInventory } from '../sim/inventory'
import { hopePrice } from '../sim/negotiation'
import { createRng } from '../sim/rng'
import { nextDay, playDay, setMenuStyle, type MenuStyle } from './bench/bot'
import { useGame } from './store'

/**
 * F&I balance on Medium (19e): the bench bot plays 56 seeded days with a
 * fair menu and again with a hard one, and the finance manager's menu is run
 * over a seeded crowd. The bands are the plan's tuning targets, a little
 * wider for the noise (a single month's sample was too small for the hard menu's
 * chargebacks).
 */

const DAYS = 56
const initial = useGame.getState()
const game = () => useGame.getState()

interface Month {
  financeShare: number
  /** F&I gross per financed deal. */
  perFinanced: number
  /** Warranties sold per financed deal, and per cash deal. */
  warrantyFinanced: number
  warrantyCash: number
  /** Everything charged back (landed and still to come), against the F&I gross. */
  chargebackShare: number
  /** The new-car buyers' average visit score: what goes into CSI. */
  csi: number
}

function playMonth(style: MenuStyle): Month {
  useGame.setState(initial, true)
  setMenuStyle(style)
  game().newGame('medium')
  const t = { fin: 0, cash: 0, finGross: 0, fiGross: 0, warFin: 0, warCash: 0, landed: 0 }
  const scores: number[] = []
  for (let d = 0; d < DAYS; d++) {
    playDay()
    const ds = game().dayStats
    t.landed += ds.fi.chargebacks
    for (const s of ds.sales) {
      if (!s.fi) continue
      t.fiGross += s.fi.gross
      const warranty = s.fi.products.some((p) => p.id === 'warranty') ? 1 : 0
      if (s.fi.financed) {
        t.fin++
        t.finGross += s.fi.gross
        t.warFin += warranty
      } else {
        t.cash++
        t.warCash += warranty
      }
    }
    for (const s of ds.clients.scores) if (s.outcome === 'bought' && s.newCar) scores.push(s.score)
    nextDay()
  }
  setMenuStyle('fair')
  const pending = game().chargebacks.reduce((sum, c) => sum + c.amount, 0)
  return {
    financeShare: t.fin / (t.fin + t.cash),
    perFinanced: t.finGross / t.fin,
    warrantyFinanced: t.warFin / t.fin,
    warrantyCash: t.warCash / t.cash,
    chargebackShare: (t.landed + pending) / t.fiGross,
    csi: scores.reduce((a, b) => a + b, 0) / scores.length,
  }
}

describe('F&I balance on Medium', { timeout: 60_000 }, () => {
  let fair: Month
  let hard: Month
  beforeAll(() => {
    fair = playMonth('fair')
    hard = playMonth('hard')
  })

  it('finances about 55–65% of buyers', () => {
    expect(fair.financeShare).toBeGreaterThan(0.5)
    expect(fair.financeShare).toBeLessThan(0.7)
  })

  it('makes $700–1,000 a financed deal on a fair menu, with few chargebacks', () => {
    expect(fair.perFinanced).toBeGreaterThan(700)
    expect(fair.perFinanced).toBeLessThan(1000)
    expect(fair.chargebackShare).toBeLessThan(0.1)
  })

  it('sells a warranty on 30–40% of financed deals, fewer to cash buyers', () => {
    expect(fair.warrantyFinanced).toBeGreaterThan(0.28)
    expect(fair.warrantyFinanced).toBeLessThan(0.45)
    expect(fair.warrantyCash).toBeLessThan(fair.warrantyFinanced)
  })

  it('makes more up front played hard, but 15–25% comes back and buyers are sourer', () => {
    expect(hard.perFinanced).toBeGreaterThan(fair.perFinanced * 1.25)
    expect(hard.chargebackShare).toBeGreaterThan(0.15)
    expect(hard.chargebackShare).toBeLessThan(0.3)
    expect(fair.csi - hard.csi).toBeGreaterThan(10)
  })
})

describe('the finance manager’s balance on Medium', () => {
  it('makes about $800 a deal at skill 3, with chargebacks under 10%', () => {
    const inventory = buildInventory(createRng(42))
    const rng = createRng(11)
    let deals = 0
    let gross = 0
    let back = 0
    for (let i = 0; i < 2000; i++) {
      const shopper = generateCustomer(`c${i}`, inventory, rng)
      const car = inventory.find((x) => x.id === shopper.targetCarId) ?? inventory[0]
      const c = { ...shopper, credit: rollCredit(shopper.archetype, rng) }
      const price = hopePrice(c, car)
      const deal = staffMenu(3, c, price, rng)
      if (!deal) continue
      const fi = saleFi(c, deal, price)
      deals++
      gross += fi.gross
      const tier = c.credit.finance ? c.credit.tier : null
      const signed = { day: 1, customerName: c.name, tier, financeId: null }
      back += rollChargebacks(fi, signed, rng).reduce((sum, x) => sum + x.amount, 0)
    }
    expect(gross / deals).toBeGreaterThan(650)
    expect(gross / deals).toBeLessThan(950)
    expect(back / gross).toBeLessThan(0.1)
  })
})
