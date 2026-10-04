/** Key bindings, listed in the corner hint and the how-to-play guide. */
export const CONTROLS: [string, string][] = [
  ['Click', 'Move / interact / greet'],
  ['WASD', 'Walk'],
  ['Q / E', 'Rotate view'],
  ['Wheel', 'Zoom'],
  ['H', 'Staff'],
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
