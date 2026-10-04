const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** "$24,300" */
export function formatMoney(amount: number): string {
  return money.format(amount)
}
