const CONTROLS: [string, string][] = [
  ['Click', 'Move / interact'],
  ['WASD', 'Walk'],
  ['Q / E', 'Rotate view'],
  ['Wheel', 'Zoom'],
  ['V', 'Wall mode'],
  ['G', 'Debug grid'],
  ['Esc', 'Cancel'],
  ...(import.meta.env.DEV ? ([['R', 'Restock (dev)']] as [string, string][]) : []),
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
