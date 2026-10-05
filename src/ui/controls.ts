/** Key bindings, listed in the corner hint and the how-to-play guide. */
export const CONTROLS: [string, string][] = [
  ['Click', 'Move / interact / greet'],
  ['WASD', 'Walk'],
  ['Q / E', 'Rotate view'],
  ['Wheel', 'Zoom'],
  ['H', 'Staff'],
  ['I', 'Stock (order cars)'],
  ['M', 'Marketing (ads)'],
  ['V', 'Wall mode'],
  ['G', 'Debug grid'],
  ['Esc', 'Cancel / walk away'],
  ['?', 'How to play'],
  ...(import.meta.env.DEV
    ? ([
        ['R', 'Restock (dev)'],
        ['T', 'Game speed (dev)'],
      ] as [string, string][])
    : []),
]

/** The same for a touch screen, where the on-screen buttons stand in for keys. */
export const TOUCH_CONTROLS: [string, string][] = [
  ['Tap', 'Move / interact / greet'],
  ['Pinch', 'Zoom'],
  ['Twist', 'Rotate view (two fingers)'],
  ['Staff', 'Staff'],
  ['Office', 'Stock and marketing'],
  ['Walls', 'Wall mode'],
  ['✕', 'Cancel'],
  ['?', 'How to play'],
]
