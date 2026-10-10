import type { MonthCsi, ScoredVisit } from './clients'

/**
 * The manufacturer's customer satisfaction index (CSI, 16f): the average visit
 * score of the month's new-car buyers, as the quota counts only new cars. On
 * the month's last day it scales the holdback (`csiFactor`), and under
 * `CSI_TIER_MIN` it keeps the franchise tier from going up. A month without a
 * new-car buyer has no CSI, and the holdback is paid as it is.
 */

/** Under this, the holdback loses a quarter. */
export const CSI_FLOOR = 70
/** The holdback is paid as it is at this CSI. */
export const CSI_PAR = 80
/** From this CSI, the holdback's top bonus. */
export const CSI_TOP = 90
/** No franchise tier-up under this. */
export const CSI_TIER_MIN = 80
/** × the holdback under `CSI_FLOOR`, at it, and from `CSI_TOP`. */
export const CSI_FACTORS = { under: 0.75, floor: 0.9, top: 1.15 }

/** The month's CSI so far, or null with no new-car buyer yet. */
export function csiOf(m: MonthCsi): number | null {
  return m.count > 0 ? Math.round(m.total / m.count) : null
}

/** `m` with the day's new-car buyers' scores added. */
export function addCsi(m: MonthCsi, scores: readonly ScoredVisit[]): MonthCsi {
  const counted = scores.filter((s) => s.outcome === 'bought' && s.newCar)
  if (counted.length === 0) return m
  return {
    total: m.total + counted.reduce((sum, s) => sum + s.score, 0),
    count: m.count + counted.length,
  }
}

/**
 * × the month-end holdback at `csi`: ×0.75 under `CSI_FLOOR`, rising from
 * ×0.9 at it to ×1 at `CSI_PAR` and ×1.15 at `CSI_TOP` and over. With no CSI
 * (no new-car buyer), ×1.
 */
export function csiFactor(csi: number | null): number {
  if (csi === null) return 1
  if (csi < CSI_FLOOR) return CSI_FACTORS.under
  if (csi < CSI_PAR) {
    const t = (csi - CSI_FLOOR) / (CSI_PAR - CSI_FLOOR)
    return CSI_FACTORS.floor + t * (1 - CSI_FACTORS.floor)
  }
  const t = Math.min(1, (csi - CSI_PAR) / (CSI_TOP - CSI_PAR))
  return 1 + t * (CSI_FACTORS.top - 1)
}

/** Whether a CSI keeps the franchise tier from going up. */
export function holdsTier(csi: number | null): boolean {
  return csi !== null && csi < CSI_TIER_MIN
}

/** "CSI 82 (holdback ×1.03)", or "CSI: no new-car buyers yet". */
export function csiLine(csi: number | null): string {
  if (csi === null) return 'CSI: no new-car buyers yet'
  return `CSI ${csi} (holdback ×${csiFactor(csi).toFixed(2)})`
}
