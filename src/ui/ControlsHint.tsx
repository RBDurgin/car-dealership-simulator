const CONTROLS: [string, string][] = [
  ['Click', 'Move / interact / greet'],
  ['WASD', 'Walk'],
  ['Q / E', 'Rotate view'],
  ['Wheel', 'Zoom'],
  ['V', 'Wall mode'],
  ['G', 'Debug grid'],
  ['Esc', 'Cancel / walk away'],
  ...(import.meta.env.DEV
    ? ([
        ['R', 'Restock (dev)'],
        ['T', 'Game speed (dev)'],
      ] as [string, string][])
    : []),
]

export function ControlsHint() {
  return (
    <div className="panel controls">
      {CONTROLS.map(([key, label]) => (
        <div key={key} className="control">
          <kbd>{key}</kbd>
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
