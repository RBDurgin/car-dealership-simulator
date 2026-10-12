import { CREDIT_TIERS } from '../sim/credit'
import { fiDayGross, fiPerDeal, penetration, PRODUCT_IDS, PRODUCTS, type FiStats } from '../sim/fi'
import { formatMoney } from '../sim/format'
import { LENDERS, MAX_MARKUP, type Lender } from '../sim/lenders'
import { financeOnDuty, FI_COMMISSION, FINANCE_FEE } from '../sim/staff'
import { useGame } from '../state/store'

const percent = (share: number) => `${Math.round(share * 100)}%`

/** "4.9%": a yearly rate. */
const rate = (r: number) => `${(r * 100).toFixed(1)}%`

/** "A–B" or "C (10% down), D": the tiers a lender takes, with any down payment they need. */
function tiersLine(l: Lender): string {
  return CREDIT_TIERS.filter((t) => l.tiers.includes(t))
    .map((t) => {
      const down = l.minDown[t]
      return down ? `${t} (${percent(down)} down)` : t
    })
    .join(', ')
}

/** "up to $40,000, $595 a loan on D": a lender's limit and fees. Empty with none. */
function termsLine(l: Lender): string {
  const parts: string[] = []
  if (l.maxAmount !== null) parts.push(`up to ${formatMoney(l.maxAmount)}`)
  for (const t of CREDIT_TIERS) {
    const fee = l.acquisitionFee[t]
    if (fee) parts.push(`${formatMoney(fee)} fee on ${t}`)
  }
  return parts.join(', ')
}

/** One column of F&I: today's or the month's. */
function FiColumn({ stats }: { stats: FiStats }) {
  const perDeal = fiPerDeal(stats)
  return (
    <>
      <td>{stats.financed + stats.cash === 0 ? '—' : `${stats.financed} / ${stats.cash}`}</td>
      <td>{stats.declined}</td>
      <td>{stats.menus}</td>
      <td className="price">{formatMoney(stats.reserve)}</td>
      <td className="price">{formatMoney(stats.productGross)}</td>
      <td className="price">{formatMoney(fiDayGross(stats))}</td>
      <td className="price">{perDeal === null ? '—' : formatMoney(perDeal)}</td>
    </>
  )
}

/** The lenders, and the F&I made today and this month. */
export function FinanceTab() {
  const today = useGame((s) => s.dayStats.fi)
  const month = useGame((s) => s.monthFi)
  const fm = useGame((s) => financeOnDuty(s.roster)?.name ?? null)
  return (
    <>
      <h2>
        Finance <span className="muted">· loans and protection products</span>
      </h2>
      <p className="muted cal-intro">
        {fm
          ? `${fm} runs the F&I menu for buyers handed off at the office desk. You run your own at your desk.`
          : 'You run the F&I menu at your desk, or at the office desk while nobody works there.'}{' '}
        Salespeople at their own desks arrange loans at the buy rate and sell no products.
      </p>
      <table className="summary-sellers">
        <thead>
          <tr>
            <th />
            <th title="Buyers who financed / paid cash">Loans / cash</th>
            <th title="Buyers every lender declined">Declined</th>
            <th title="Deals that went through the F&I menu">Menus</th>
            <th>Reserve</th>
            <th>Products</th>
            <th>F&amp;I gross</th>
            <th>Per deal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Today</td>
            <FiColumn stats={today} />
          </tr>
          <tr>
            <td>This month</td>
            <FiColumn stats={month} />
          </tr>
        </tbody>
      </table>
      <h3>
        Products <span className="muted">· share of menus that took each</span>
      </h3>
      <table className="summary-sellers">
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Today</th>
            <th>This month</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCT_IDS.map((id) => {
            const p = PRODUCTS[id]
            const t = penetration(today, id)
            const m = penetration(month, id)
            return (
              <tr key={id}>
                <td>
                  {p.name}
                  {p.financedOnly && <span className="muted"> · loans only</span>}
                </td>
                <td className="price">
                  {formatMoney(p.low)}–{formatMoney(p.high)}
                </td>
                <td>{t === null ? '—' : percent(t)}</td>
                <td>{m === null ? '—' : percent(m)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <h3>
        Lenders <span className="muted">· markup up to {MAX_MARKUP} points over the buy rate</span>
      </h3>
      <table className="summary-sellers">
        <thead>
          <tr>
            <th>Lender</th>
            <th>Credit</th>
            <th>Buy rate</th>
            <th>Terms</th>
          </tr>
        </thead>
        <tbody>
          {LENDERS.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>{tiersLine(l)}</td>
              <td>{rate(l.buyRate)}</td>
              <td className="muted">{termsLine(l) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted cal-intro">
        The lender pays a reserve on every point of markup, and products earn their price less their
        cost. A finance manager earns {formatMoney(FINANCE_FEE)} a deal plus{' '}
        {percent(FI_COMMISSION)} of its F&amp;I gross, and the more skilled they are, the more they
        make.
      </p>
    </>
  )
}
