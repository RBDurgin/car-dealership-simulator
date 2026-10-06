import { COARSE, useMediaQuery } from '../input/useMediaQuery'
import { AUDIO_BUSES, type AudioBus } from '../sim/audioSettings'
import { useGame } from '../state/store'

const BUS_LABELS: Record<AudioBus, string> = {
  master: 'Master',
  music: 'Music',
  sfx: 'Sound effects',
  voice: 'Voices',
}

/** Volumes and mute, opened from the top bar's speaker or the title screen. The game runs on. */
export function AudioPanel() {
  const open = useGame((s) => s.audioOpen)
  const audio = useGame((s) => s.audio)
  const touch = useMediaQuery(COARSE)
  if (!open) return null
  const game = useGame.getState()

  return (
    <div
      className="modal-backdrop audio-backdrop"
      onClick={(e) => e.target === e.currentTarget && game.toggleAudioPanel(false)}
    >
      <div className="panel day-summary audio-panel" role="dialog" aria-label="Sound settings">
        <div className="info-kicker">Settings</div>
        <h2>Sound</h2>
        <button
          className={audio.muted ? 'btn btn-primary' : 'btn'}
          aria-pressed={audio.muted}
          onClick={() => game.toggleMute()}
        >
          {audio.muted ? '🔇 Muted' : '🔊 Mute all'}
          {!touch && <kbd>N</kbd>}
        </button>
        <div className={audio.muted ? 'audio-sliders muted' : 'audio-sliders'}>
          {AUDIO_BUSES.map((bus) => (
            <label key={bus} className="audio-slider">
              <span>{BUS_LABELS[bus]}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(audio[bus] * 100)}
                onChange={(e) => game.setVolume(bus, Number(e.target.value) / 100)}
              />
              <span className="audio-value">{Math.round(audio[bus] * 100)}%</span>
            </label>
          ))}
        </div>
        <p className="audio-note">Kept on this device, apart from your save.</p>
        <button className="btn btn-primary" autoFocus onClick={() => game.toggleAudioPanel(false)}>
          Done
        </button>
      </div>
    </div>
  )
}
