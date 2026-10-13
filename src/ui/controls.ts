/** Key bindings, listed in the corner hint and the how-to-play guide. */
export const CONTROLS: [string, string][] = [
  ['Click', 'Move / interact / greet / buy / appraise / call / recondition / confront Nazma'],
  ['WASD', 'Walk'],
  ['Q / E', 'Rotate view'],
  ['Wheel', 'Zoom'],
  ['H', 'Staff'],
  ['I', 'Stock (order cars)'],
  ['M', 'Marketing (ads)'],
  ['U', 'Upgrades (outside, showroom, waiting area)'],
  ['C', 'Calendar (the week ahead)'],
  ['K', 'Rival (Nazma’s lot across the road)'],
  ['B', 'Service (the garage)'],
  ['L', 'Clients (the client book)'],
  ['F', 'Finance (F&I, loans and lenders)'],
  ['P', 'Stats (totals, records, charts and achievements)'],
  ['V', 'Wall mode'],
  ['G', 'Debug grid'],
  ['Esc', 'Cancel / walk away / head back'],
  ['1–3', 'Talking point (on a test drive)'],
  ['N', 'Mute sound'],
  ['?', 'How to play'],
  ...(import.meta.env.DEV
    ? ([
        ['R', 'Restock (dev)'],
        ['Shift R', 'Add a used car (dev)'],
        ['Shift L', 'Bring back a client, due ones first (dev)'],
        ['T', 'Game speed (dev)'],
      ] as [string, string][])
    : []),
]

/** The same for a touch screen, where the on-screen buttons stand in for keys. */
export const TOUCH_CONTROLS: [string, string][] = [
  ['Tap', 'Move / interact / greet / buy / appraise / call / recondition / confront Nazma'],
  ['Pinch', 'Zoom'],
  ['Twist', 'Rotate view (two fingers)'],
  ['Staff', 'Staff'],
  ['Office', 'Stock, marketing, upgrades, calendar, rival, service, clients, finance, stats'],
  ['Walls', 'Wall mode'],
  ['✕', 'Cancel / head back'],
  ['🔊', 'Sound settings and mute'],
  ['?', 'How to play'],
]
