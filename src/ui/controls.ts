/** Key bindings, listed in the corner hint and the how-to-play guide. */
export const CONTROLS: [string, string][] = [
  ['Click', 'Move / interact / greet / buy / appraise / recondition / confront Jaguar'],
  ['WASD', 'Walk'],
  ['Q / E', 'Rotate view'],
  ['Wheel', 'Zoom'],
  ['H', 'Staff'],
  ['I', 'Stock (order cars)'],
  ['M', 'Marketing (ads)'],
  ['U', 'Upgrades (outside, showroom, waiting area)'],
  ['C', 'Calendar (the week ahead)'],
  ['B', 'Service (the garage)'],
  ['K', "Nazma's (cupcakes and Jaguar's record)"],
  ['V', 'Wall mode'],
  ['G', 'Debug grid'],
  ['Esc', 'Cancel / walk away'],
  ['N', 'Mute sound'],
  ['?', 'How to play'],
  ...(import.meta.env.DEV
    ? ([
        ['R', 'Restock (dev)'],
        ['Shift R', 'Add a used car (dev)'],
        ['T', 'Game speed (dev)'],
      ] as [string, string][])
    : []),
]

/** The same for a touch screen, where the on-screen buttons stand in for keys. */
export const TOUCH_CONTROLS: [string, string][] = [
  ['Tap', 'Move / interact / greet / buy / appraise / recondition / confront Jaguar'],
  ['Pinch', 'Zoom'],
  ['Twist', 'Rotate view (two fingers)'],
  ['Staff', 'Staff'],
  ['Office', "Stock, marketing, upgrades, calendar, service, Nazma's"],
  ['Walls', 'Wall mode'],
  ['✕', 'Cancel'],
  ['🔊', 'Sound settings and mute'],
  ['?', 'How to play'],
]
