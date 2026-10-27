/**
 * The big panels' chunks (18e), loaded by `ui/lazyPanels` the first time a
 * panel opens, or by `prefetchPanels` once the browser is idle after the
 * title screen is up, so the page loads less before it.
 */
export const panelChunks = {
  howToPlay: () => import('./HowToPlay').then((m) => ({ default: m.HowToPlay })),
  audio: () => import('./AudioPanel').then((m) => ({ default: m.AudioPanel })),
  stock: () => import('./StockPanel').then((m) => ({ default: m.StockPanel })),
  summary: () => import('./DaySummary').then((m) => ({ default: m.DaySummary })),
  tutorialCard: () => import('./TutorialCard').then((m) => ({ default: m.TutorialCard })),
}

/** Fetches every panel's chunk while the browser is idle, so none waits on the network when opened. */
export function prefetchPanels(): void {
  const load = () => Object.values(panelChunks).forEach((chunk) => void chunk())
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 3000 })
  else setTimeout(load, 1000)
}
