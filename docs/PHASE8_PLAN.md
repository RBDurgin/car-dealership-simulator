# Phase 8 Plan — Music, sound effects and gibberish voices

**Status:** Planned 2026-10-05. We'll do one sub-phase per session and stop for Robert's review after each, as in earlier phases.

## Context

SPEC Phase 8: "Background music + sound effects. Talking between characters should be incomprehensible gibberish, similar to characters in the Sims talking."

The game is silent today. There's no audio code, no audio assets and no Web Audio use. Phases 2–7 left plenty of moments that deserve a sound: sales, haggling, arrivals, washes, orders, the day summary. Customers and staff already talk to each other through phases (`talking`, `considering`, `signing`). Those phases tell us who is speaking, to whom and in what mood.

**Decisions made with Robert (2026-10-05):**

- **Sources:** CC0 sample packs for sound effects (Kenney's audio packs, the same source as the models) and CC0 music tracks. Gibberish voices are **synthesized live in Web Audio**, and each character gets its own pitch, so no voices need recording.
- **Music:** a day-part playlist of looping tracks (light jazz / lounge). It crossfades between morning, afternoon and the closing rush, and the title screen and day summary have their own tracks.
- **Settings:** a mute button plus master, music, SFX and voice sliders. They're kept in localStorage, separate from the save game.

## Architecture additions

```
src/audio/            # Web Audio side: no React or three.js; imports sim/ and state/ only
  engine.ts           # one AudioContext, unlocked on first gesture; buses master → music, sfx, voice
  samples.ts          # lazy fetch + decodeAudioData cache, keyed by SfxId
  music.ts            # two-deck crossfader (HTMLAudioElement → MediaElementSource)
  voice.ts            # gibberish synth: oscillator → formant bandpasses → envelope; noise consonants
  sfxBridge.ts        # useGame.subscribe → sfxFor(prev, next) → play
src/sim/
  audioSettings.ts    # pure: defaults, clamp, parse, effectiveGain(settings, bus)
  sfxEvents.ts        # pure: sfxFor(prev, next): SfxCue[] from store diffs
  musicPlan.ts        # pure: trackFor({ screen, minute, summaryOpen, paused })
  gibberish.ts        # pure: voiceOf(id, variant), utterance(rng, tone, length) → syllables
  chatter.ts          # pure: who speaks next, from customer phase / handler / haggle
public/audio/
  sfx/*.ogg
  music/*.ogg (+ .mp3 for Safari)
  LICENSE.md          # credits, like public/models/LICENSE.md
```

**Conventions:**

- `src/audio/` reacts to the store through `subscribe`, the same way `state/persistence.ts` and `scene/runtime.ts` do. Nothing in `sim/` calls it, and nothing calls `setState` per frame for sound.
- Positions for panning and falloff come from the `scene/runtime` maps: `customerPos`, `staffPos`, `ambientPos`, `playerPos`, `cameraState`.
- The decision-making is pure and tested in `sim/`: which cue, which track, which voice, who talks next. `src/audio/` only turns those decisions into sound.

## Hooks that already exist

| Hook | Where | Phase 8 use |
|---|---|---|
| `isPaused(s)` | `state/store.ts:299` | Duck SFX/voices, muffle music |
| `screen` (`title` / `playing`) | `state/store.ts` | Title track; unlock audio on first click |
| `clock.minute`, `OPEN_MINUTE`, `CLOSE_MINUTE` | `sim/clock.ts` | Day part for the playlist |
| Day summary open after `settleDay` | `ui/DaySummary.tsx`, store | Summary track, paper sound |
| `phase`, `handlerId`, `haggle`, `leaveReason` | `sim/customers.ts` | Who talks, and in what tone |
| `bubbleOf(c)` | `sim/customers.ts:330` | Mood mapping (counter → question, upset → grumble) |
| `sellCar`, `orderCar`, `launchCampaign`, `buyImprovement` | store | Cash register / coin cues |
| `hire`, `fire`, `staffWash`, the player's `wash` action | store | Stamp, water spray |
| `showNotice`, `startNextDay` | store | Pop, morning bell |
| `hashSeed`, `createRng` | `sim/rng.ts` | Stable per-character voice |
| `controlsOpen` persisted by subscribe | `state/persistence.ts` | Same pattern for audio settings |
| `COARSE` | `input/useMediaQuery.ts` | Touch wording for the mute button |

## Sub-phases

### 8a: Audio foundation and settings

**Status:** Done 2026-10-05. The smoke cue is Kenney's `click_002.ogg` on every HUD button and on letting go of a volume slider. The speaker button opens the sound panel, which holds the mute switch. Arrow keys no longer walk the player while a slider has focus.

- `audio/engine.ts`:
  - One lazy `AudioContext`, resumed on the first `pointerdown`/`keydown`. The title screen click counts, which covers iOS and the autoplay rules.
  - Gain buses master → music / sfx / voice.
  - Suspend on `document.hidden`. Duck SFX and voices while `isPaused`.
- `sim/audioSettings.ts` + tests:
  - `AudioSettings { master, music, sfx, voice, muted }`, each 0–1, with defaults.
  - `parseAudioSettings` tolerates junk, and `effectiveGain(settings, bus)` gives a bus's gain.
- Store: `audio` and `setVolume(bus, v)` / `toggleMute()`. They're persisted under their own localStorage key with a guarded subscribe, like `controlsOpen`. They're not part of the save, so `SAVE_VERSION` is unchanged.
- UI:
  - A 🔊 / 🔇 button in `ui/TopBar.tsx` (works on touch).
  - An audio panel with four sliders, opened from the top bar and the title screen.
  - **N** toggles mute (the key is free).
- `audio/samples.ts` with one smoke cue (a soft UI click on HUD buttons) to prove the chain end to end.
- Help: add N to `ui/controls.ts` and a touch row for the speaker button; mention the sound settings in `ui/HowToPlay.tsx`.

### 8b: Sound effects

**Status:** Done 2026-10-05. Kenney has no cash register or water, so a sale plays a rising sax jingle (Music Jingles `SAX10`), the morning bell is a steel-drum jingle (`STEEL10`), and the wash is filtered noise made in `audio/samples.ts`. The upset walk-out is a door closing. Starting or resuming a game only rings the bell, so a loaded save doesn't replay its hires and purchases. A notice's pop yields to a bigger cue that just played for the same event (a sale, a hire, an order), and a button's click yields to the panel it opened or closed. The listener is the player (the camera follows them). The optional ambient beds are left for later.

- Choose about 12 CC0 cues from Kenney's Interface / Impact / RPG audio packs into `public/audio/sfx/`, and credit them in `public/audio/LICENSE.md`.
- `sim/sfxEvents.ts` + tests: `sfxFor(prev, next)` diffs two store states into cues:
  - cash register: a sale
  - coin: an order, campaign or upgrade bought
  - door chime: a customer arrives
  - pop: a notice
  - paper: the day summary
  - bell: `startNextDay`
  - stamp: hire / fire
  - water spray: a car washed (by the porter or the player)
  - soft thud: an upset walk-out
  - click: a panel opens or closes
- Spatial cues: each cue can name a subject (customer, employee or car). `audio/sfxBridge.ts` looks up its position in the runtime maps, fades it with distance from the camera target and pans it by screen x (`StereoPannerNode`). UI cues aren't spatial.
- Each cue has a minimum gap, so the dev ×4 time scale doesn't make a burst of chimes.
- Optional: an outdoor traffic bed and an indoor room tone, crossfaded by where the camera is looking.

### 8c: Music

**Status:** Done 2026-10-05. The tracks are CC0 bossa / jazz loops from OpenGameArt (credited in `public/audio/LICENSE.md`), loudness-matched and encoded as OGG and MP3. Each track has its own `HTMLAudioElement` and fader, so it resumes where it stopped; the outgoing one pauses after its fade. The closing rush carries on past 18:00 until the last customer leaves, then the summary takes over. "Full-screen panel" means the how-to-play guide and the rotate prompt (`isMuffled`); the staff, office and sound panels leave the music alone. A browser that refuses to start a stream outside a gesture gets it started on the next tap or key. `dayOver` in `sim/clock.ts` is now the one test for "the summary is up".

- Choose five CC0 loops (light jazz / lounge): title, morning, afternoon, closing rush (last hour) and summary. They're OGG with MP3 for Safari, streamed through `HTMLAudioElement` rather than decoded whole.
- `sim/musicPlan.ts` + tests: `trackFor(state)` → `TrackId`. The day parts come from `minute`: morning before 12:00, afternoon before 17:00, then the closing rush.
- `audio/music.ts`:
  - A two-deck crossfade of about 3 s.
  - Each track resumes from where it stopped.
  - A low-pass filter and lower volume while paused or while a full-screen panel is open.
- The track only changes on a discrete store change (the clock step, screen, summary or pause), through `subscribe`. Nothing runs per frame.

### 8d: Gibberish voices

- `sim/gibberish.ts` + tests (determinism and ranges):
  - `voiceOf(id, variant)` gives a base pitch (a male or female range from the character variant, plus seeded jitter), a speech rate and a formant shift. The same character always sounds the same.
  - `utterance(rng, tone, syllables)` gives `{ consonant, vowel formants, ms, pitch }[]`, shaped by a `Tone` contour:
    - neutral
    - question: rises at the end
    - happy: higher and bouncy
    - grumble: low and falling
    - greeting
- `audio/voice.ts`:
  - A sawtooth/pulse oscillator through 2–3 bandpass formant filters, then an ADSR envelope.
  - Consonants are short bursts of filtered noise.
  - Everything is scheduled on the audio clock, so nothing runs per frame.
- `sim/chatter.ts` + tests: `nextLine(customer, handler, now)` gives the speaker, tone and length.
  - **Talking:** the seller and the customer take turns.
  - **A counter (`haggle`):** the customer uses the question tone.
  - **Considering:** a short "hmm".
  - **Accept:** happy. **An upset walk-out:** grumble.
  - **The receptionist's greeting and finance signing:** a murmur.
  - **Others:** the owner's visit, and now and then a couple chatting with their companion.
- `scene/Chatter.tsx`: keeps turn timers in refs and asks `voice.ts` to speak at the speaker's runtime position.
  - At most 3 voices at once, nearest first.
  - Voices far from the camera target are skipped.
  - Optional: a small head-bob while speaking.
- The player's character has a voice too, when the player is the handler.
- Help: mention the voice slider. There are no new keys.

## Verification (each sub-phase)

- `npm test`:
  - new tests for `audioSettings`, `sfxEvents`, `musicPlan`, `gibberish` and `chatter`
  - store and persistence tests for the settings, with the existing fake localStorage
- `npm run lint`, `npm run build`.
- `npm run dev` / `/run`, listening by hand:
  - No sound before the first gesture, and no AudioContext warnings in the console.
  - Mute and the sliders survive a reload.
  - Each SFX plays once per event, also at dev speed.
  - Music crossfades at the day-part boundaries and on the summary.
  - During a haggle the voices take turns; far-off voices stay quiet, and they all pause with the game.
  - Check a phone viewport: audio unlocks on the first tap, and the mute button is reachable.
