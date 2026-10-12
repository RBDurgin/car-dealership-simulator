import { formatMoney } from '../sim/format'
import { carName } from '../sim/interactables'
import type { InventoryCar } from '../sim/inventory'
import type { NightTheft } from '../sim/nazma'

/** The morning's word on a night's theft. */
export function theftNotice(theft: NightTheft, rival: string | null = null): string {
  if (theft.outcome === 'foiled') return 'Your guard ran someone off the lot last night.'
  const { car } = theft
  const where = rival ? ` It's for sale at ${rival} now.` : ''
  const stole = `Nazma stole the ${carName(car.model)} off the lot overnight.${where}`
  return car.floored ? `${stole} The bank called in its ${formatMoney(car.cost)} loan.` : stole
}

/** The morning's word on the bank covering yesterday's shortfall. */
export function bailoutNotice(amount: number): string {
  return `Yesterday the bank covered your ${formatMoney(amount)} shortfall. It won't do it again.`
}

/** "3 cars delivered: 2 on the lot, 1 in the showroom." */
export function deliveryNotice(cars: readonly InventoryCar[]): string {
  const lot = cars.filter((c) => c.location === 'lot').length
  const showroom = cars.length - lot
  const where = [lot > 0 && `${lot} on the lot`, showroom > 0 && `${showroom} in the showroom`]
    .filter(Boolean)
    .join(', ')
  return cars.length === 1
    ? `A ${carName(cars[0].model)} was delivered ${lot ? 'to the lot' : 'to the showroom'}.`
    : `${cars.length} cars delivered: ${where}.`
}
