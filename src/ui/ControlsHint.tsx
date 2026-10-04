import { CONTROLS } from './controls'

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
