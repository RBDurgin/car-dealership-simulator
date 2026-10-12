# Performance

Phase 18 measures before it optimises: every change in 18b–18e needs a before and after number from the tools below, and a change that doesn't move a number gets reverted. This file keeps the baseline (18a, 2026-10-10) and each sub-phase adds its after numbers under it.

## Tools

- **`?perf` overlay** (`scene/PerfOverlay.tsx`, lazy-loaded only with the flag; `?fps` still works). Add `?perf` to the game's URL. It shows:
  - fps and frame time (p50/p95 over the last couple of seconds);
  - the Graphics setting and the quality tier drawn at (added in 18e);
  - the last frame's draw calls and triangles (shadow passes included), and the geometries and textures the renderer holds;
  - store `set()` calls per second and ms per second spent in `useGame.subscribe` listeners (`state/perf.ts`; components' selectors aren't timed);
  - people in the world (player included), visitors' cars and `<Html>` badges.
  - At the end of each day, the day summary shows the day's readings (only those taken while the day was played) as rows for the device table below, one per game speed played, with a **Copy** button. Under them it shows the renderer's geometries and textures at the day's first and last readings, to show whether they climb. On the first day played, the first reading comes while models are still loading.
- **`?perf=busy`**: a new game jumps straight to the busy late-game day (`state/perfScenario.ts`, the same scene the `@perf` e2e scenario measures): every expansion, 44 cars, 12 staff, 12 customers at once, rain and Nazma on his way. Such a game is never saved and leaves the trophy case alone, so it's safe on the deployed site. Continuing a save with the flag on isn't changed, but isn't saved either.
- **Sim bench**: `npm run bench` (not part of `npm test`). `src/state/bench/longGame.bench.ts` plays 500 days headless on Medium and Hard with `bench/bot.ts`, a busy but simple player: it serves one deal at a time (taking each counter), orders stock and ads each morning, and buys expansions when its rank allows. It prints ms per day (first, middle and last 50 days, which should stay flat), ms per `tickClock`, store sets per `tickClock` and per `startNextDay` (each set runs every listener; added in 18b), what got played, and the day-500 save's size and times, then benches `createSave` and `parseSave` on that save. A third run (added in 18c) plays 200 Medium days with the game's listeners subscribed (autosave, the preferences, tips, achievements, the trophy case and the sound ones, with the browser stubbed out; Chatter's live in a scene component) and reports their ms per set, per clock step and per day. The store's rngs are seeded by the day, so a run plays the same each time; the timings are noisy run to run (±30% on a day window), so compare a few runs. It also runs 18d's micro-benches, which print µs per frame or search: `src/sim/crowd.bench.ts` (one frame of 60 walkers) and `src/sim/pathfinding.bench.ts` (A* on the full map).
- **Browser perf scenario**: `npm run e2e:perf` (tagged `@perf`, left out of `npm run e2e` and CI). `e2e/perf.spec.ts` starts a game with `?perf=busy` and reads the overlay once a second for 30 s at 1× and at 4×. It writes `e2e/perf-results.json`, with React's commits, components rendered and render ms per game minute (added in 18c, counted through the hook React DevTools uses, so dev builds only), then closes the day and checks the summary's report. Screenshots go to `test-results/perf-busy.png` and `test-results/perf-report.png`. Under SwiftShader the fps measures the CPU, not a GPU; the draw calls, triangles, store sets, walkers and React's renders are what to compare there. Counted per game minute, the renders don't depend on the frame rate.

## Baseline (18a)

### Sim bench (dev container, Node 24)

| Level  | ms/day first 50 | middle 50 | last 50 | p95 day | ms/tick mean | p95   | Sales | Rank reached  | Save at day 500 | createSave | parseSave |
| ------ | --------------- | --------- | ------- | ------- | ------------ | ----- | ----- | ------------- | --------------- | ---------- | --------- |
| Medium | 6.5             | 6.0       | 3.7     | 7.7     | 0.059        | 0.124 | 2,954 | Regional Name | 163 KB          | 0.8 ms     | 1.3 ms    |
| Hard   | 2.9             | 2.5       | 1.6     | 5.5     | 0.033        | 0.088 | 762   | Corner Lot    | 131 KB          | 0.6 ms     | 1.0 ms    |

- Ms per day doesn't grow over 500 days, so no replay shows up at this scale yet (18d checks again).
- The client book is full (200, `CLIENT_CAP`) by day 500 on both levels. The save is well under the 500 KB target, and both save functions are well under 20 ms.
- On Hard the bot goes broke and stops restocking, so its days are lighter. Medium is the workload to compare.

### Browser, busy late-game day (`npm run e2e:perf`)

| Where                                              | Speed | fps  | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` | Heap   |
| -------------------------------------------------- | ----- | ---- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- | ------ |
| SwiftShader (e2e, headless)                        | 1×    | 2.9  | 947 ms    | 615 / 632               | 229k      | 149        | 72       | 0.8    | 0.43          | 27     | 13       | 98 MB  |
| SwiftShader (e2e, headless)                        | 4×    | 2.0  | 803 ms    | 616 / 632               | 230k      | 149        | 78       | 4.0    | 0.55          | 29     | 18       | 98 MB  |
| Desktop, Chrome, busy day (Medium)                 | 1×    | 30.0 | 45 ms     | 738 / 828               | 252k      | 662        | 128      | 2.2    | 0.16          | 20     | 15       | 91 MB  |
| Desktop, Chrome, busy day (Medium, 800×600 window) | 1×    | 57.2 | 21 ms     | 505 / 625               | 193k      | 1289       | 122      | 4.0    | 0.15          | 21     | 15       | 101 MB |
| iPhone, Chrome, quiet day                          | 1×    | 60   | 17 ms     | 372                     | 104k      | 438        | 129      |        |               |        |          |        |
| iPhone, Chrome, busy day (Hard)                    | 1×    | 59.6 | 18 ms     | 593 / 755               | 198k      | 505        | 124      | 2.6    | 0.31          | 20     | 14       |        |

- The draw calls (about 615 on a busy day) fall at the top of the planning estimate of 300–600. 18e's target is at least a third fewer.
- The real-device rows are for Robert to fill: open the game with `?perf=busy`, start a new game, play the day out at 1× (or at 1× then 4×), and copy the rows from the day summary.
- iPhone, quiet day (2026-10-10): a steady 60 fps (p50 and p95 both 17 ms), the display's cap, so there's headroom that this reading can't show. Chrome on iOS runs on WebKit, so it stands in for Safari. A busy day is still to measure.
- iPhone, busy day (2026-10-11, local preview, Hard, 6.4 minutes of readings): the day's average from the summary's report. It held 60 fps (59.6, 18 ms p95) at 593 draw calls on average and 755 at most, about the e2e busy day's average. The level doesn't change the scene, only how many customers come, so Hard and Medium busy days are comparable. The phone has headroom at 1×; 18e's draw-call cut is for weaker phones.
- Geometries climb over every long day: the iPhone's from 114 to 505 (438 on the earlier quiet day), the desktop's from 180 to 662 full-window and from 130 to 1289 at 800×600, each over about 6 minutes. Textures level off at about 125. In the e2e run (0.8 minutes) they went from 54 to 151. The low starts are models still loading, but on a busy day only people come and go after that, so something keeps making geometries it doesn't free. It isn't the characters' `SkeletonUtils.clone`, which shares the model's geometries (only the materials are cloned, and those aren't counted here). The cause is unknown. 18e should find it first: run the `@perf` scenario for a whole day, watch `renderer.info.memory.geometries`, and look for components that build a geometry on every render or remount without it being disposed.
- Desktop Chrome, busy day (2026-10-11, Medium, rain, default zoom, plugged in, 6.3 minutes of readings): 30 fps on average, 45 ms p95, the slowest device so far. No frame-rate cap applied: macOS Low Power Mode was off, and Chrome's Energy Saver never runs while plugged in. So frames take longer than 16.7 ms, and on a 60 Hz screen each one waits for every other refresh, hence an even 30. At the same zoom, the desktop's wider window shows more of the lot than the phone's: 738 draw calls on average and 252k triangles, against the iPhone's 593 and 198k. It also fills a much bigger canvas at DPR 2 with a 4096 shadow map (the phone's is 2048), so the likely cost is fill: the pixels drawn each frame. 18e's adaptive quality (DPR and shadow map steps) is aimed at that, so the desktop needs it as much as phones do.
- Desktop Chrome in an 800×600 window (2026-10-11, Medium, rain, plugged in, loaded at that size so the shadow map stayed 4096, 6.0 minutes): 57 fps, 21 ms p95, against 30 fps full-window. The draw calls fell less (505 against 738, as less of the lot is in view) than the pixels did (about a third), so the full-window 30 was mostly fill. 18e's DPR and shadow-map steps come first for the desktop; the draw-call cuts help both.

### Bundle and assets (`npm run build`)

| What                                    | Size                                    | gzip   |
| --------------------------------------- | --------------------------------------- | ------ |
| JS, one chunk, before 18a               | 1,675 KB                                | 483 KB |
| JS, main chunk after 18a                | 1,674 KB                                | 483 KB |
| `PerfOverlay` chunk (only with `?perf`) | 1.6 KB                                  | 0.8 KB |
| CSS                                     | 24 KB                                   | 5.8 KB |
| Models (`public/models`, 37 GLBs)       | 4.5 MB, uncompressed                    |        |
| Audio (`public/audio`)                  | 16 MB (music in both `.ogg` and `.mp3`) |        |

18a moved drei's `Stats` out of the main chunk, which saves about 1 KB. Most of the bundle is three.js, R3F and drei, which 18e splits into a vendor chunk.

## 18b: store split (2026-10-11)

The store is split into slices, with every change in one clock step, and in one morning, stored by a single `set()`.

### Sim bench

| Level          | Sets per tick (mean / max) | Sets per morning (mean / max) | ms/day first 50 | middle 50 | last 50 | ms/tick mean | Sales | Save at day 500 |
| -------------- | -------------------------- | ----------------------------- | --------------- | --------- | ------- | ------------ | ----- | --------------- |
| Medium, before | 2.08 / 3                   | 1.98 / 2                      | 7.8             | 8.0       | 4.3     | 0.067        | 2,954 | 163 KB          |
| Medium, after  | **1 / 1**                  | **1 / 1**                     | 7.8             | 8.7       | 5.4     | 0.081        | 2,954 | 163 KB          |
| Hard, before   | 2.03 / 3                   | 1.37 / 2                      | 3.8             | 1.8       | 1.7     | 0.034        | 762   | 131 KB          |
| Hard, after    | **1 / 1**                  | **1 / 1**                     | 4.6             | 2.9       | 2.1     | 0.046        | 771   | 126 KB          |

- The bot's day is light (staff stand idle and walkers arrive at once), so it makes about 2 sets a tick. In the browser a step also carries notices, staff calls and the scene's reports; those still make their own sets outside `tickClock` (18c looks at them).
- Ms per tick is up about 15% (Medium 0.067 → 0.077–0.086 over four runs; Hard 0.034 → 0.044–0.046), about 11 µs a tick: each `set` inside a batch copies the state, so what `get` handed out stays unchanged. Copying only after a read (copy-on-write) measured 0.074–0.078, within the noise, so it was reverted. In the browser the trade is worth it: each `set` runs every listener and selector, and 18a measured the listeners alone at 0.07–0.5 ms a set (desktop to SwiftShader), so the set saved per tick is worth several times the copy. 18c's overlay readings will show it.
- **Medium plays out identically** (every played total and the save size match), which shows the split changed no behaviour.
- Hard differs only because the bench plays Hard after Medium in one process: before 18b, Hard's customer ids carried on from Medium's game (ids seed some rolls), and now `newGame` resets them (`resetRng`). With the old carry-over put back for a check, Hard matched the baseline exactly (762 sales, cash −$5,427).

## 18c: subscriptions and selectors (2026-10-11)

Listeners go through `subscribeTo` (`state/subscribe.ts`), components select only what they draw (memoised reads in `state/selectors.ts`), and the frame loops stop repeating store calls that changed nothing (`report` in `scene/walker.ts`).

### React on the busy day (SwiftShader, per game minute)

| Speed | Commits, before | after    | Components rendered, before | after   | Render ms, before | after    |
| ----- | --------------- | -------- | --------------------------- | ------- | ----------------- | -------- |
| 1×    | 0.80            | **0.55** | 3.0                         | **2.3** | 1.79              | **1.56** |
| 4×    | 1.91            | **1.50** | 35.7                        | **5.9** | 9.65              | **3.80** |

- Measured with a throwaway probe on 18b and on 18c, one run each, then built into the `@perf` scenario. Its first run on 18c read 0.60 / 2.35 / 0.88 at 1× and 1.49 / 6.03 / 3.35 at 4×, in line.
- The biggest cut isn't on the plan's list: every change to the stock (a browse visit's dirt, a wash, a sale) re-rendered all ~45 cars and their props. `PropView` is now memoised on what it draws, so only the car that changed redraws. Next came `ActionMenu`, which re-rendered on every customer change while closed, and the summary, win screen and staff panel, which selected the day's stats, the career and the roster while closed.
- `tickClock` gave `serviceAway` and `serviceComebacks` a new array every step even when nobody moved; it keeps them now, so nothing watching them sees a change.

### `@perf` overlay, busy day (SwiftShader)

| Speed | fps, before | after   | p95 frame, before | after  | Sets/s, before | after | Listener ms/s, before | after |
| ----- | ----------- | ------- | ----------------- | ------ | -------------- | ----- | --------------------- | ----- |
| 1×    | 2.6         | **3.3** | 866 ms            | 778 ms | 0.37           | 0.53  | 0.03                  | 0.03  |
| 4×    | 2.0         | **2.5** | 877 ms            | 806 ms | 3.14           | 3.21  | 0.34                  | 0.30  |

- SwiftShader's frame rate is CPU-bound, so less React work shows up as frames. Draw calls are unchanged (616), as 18c doesn't touch rendering.
- Sets per second are the same; the frame loops' repeated calls changed nothing, so they never counted as sets (the probe found 1 in about 100 calls over 40 s at 4×). `report` keeps it that way when a claim or a lead fails and would otherwise be retried every frame.

### Desktop, Chrome, busy day (Medium, rain, local preview, full window)

| When        | Speed | fps  | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` | Heap  |
| ----------- | ----- | ---- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- | ----- |
| 18a         | 1×    | 30.0 | 45 ms     | 738 / 828               | 252k      | 662        | 128      | 2.2    | 0.16          | 20     | 15       | 91 MB |
| 18c (10-11) | 1×    | 28.8 | 47 ms     | 758 / 899               | 250k      | 972        | 131      | 2.8    | 0.16          | 20     | 15       | 92 MB |

- No change, within the run-to-run noise, as expected: full-window on the desktop is bound by fill (18a's 800×600 reading), and 18c cut only CPU work (React renders and store calls). 18e's DPR and shadow-map steps are what should move it.
- In an 800×600 window (loaded at that size, 6.0 minutes): 56.1 fps, 21 ms p95, 542 / 659 draw calls, 198k triangles, 3.3 sets/s, 0.15 listener ms/s, 92 MB, against 18a's 57.2 fps, 21 ms, 505 / 625, 193k, 4.0, 0.15 and 101 MB. Also unchanged: even with fewer pixels, the CPU work 18c saved (a few ms of renders a game minute) is too small to show at 1×. Geometries 129 → 1153 (18a 130 → 1289).
- Geometries climbed from 180 to 972 over 6.2 minutes of readings (662 in 18a's run), textures 72 → 131. The climb is still there and still unexplained; 18e looks for it first.

### iPhone, Chrome, busy day (rain, local preview)

| When                | Speed | fps  | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` |
| ------------------- | ----- | ---- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- |
| 18a (Hard)          | 1×    | 59.6 | 18 ms     | 593 / 755               | 198k      | 505        | 124      | 2.6    | 0.31          | 20     | 14       |
| 18c (10-11, Medium) | 1×    | 59.4 | 18 ms     | 491 / 585               | 174k      | 381        | 130      | 2.2    | 0.25          | 20     | 14       |

- Still a steady 60 fps (the display's cap), so the phone had headroom before and still does; 18c can't show here.
- The draw calls and triangles are lower, but 18c doesn't change what's drawn: it's how much of the lot was in view (the camera wasn't fixed between runs). The level doesn't change the scene.
- Geometries climbed 126 → 381 over 6.0 minutes (114 → 505 in 18a), textures 65 → 130: the same climb as on the desktop.

### Listeners (sim bench, 200 Medium days, 324 sets a day)

| Run    | ms per set | ms per day |
| ------ | ---------- | ---------- |
| Before | 0.0071     | 2.2        |
| After  | 0.0093     | 2.9        |

- Same-machine runs, back to back; earlier runs of the "before" code read 2.7–3.4 ms a day, so the difference is about the run-to-run noise. Either way the listeners take under 10 µs a set, far under the 1 ms per step target, and in the browser a set comes a few times a second.
- The plan gated `sfxFor`, `reactionsFor`, `tipFor` and `achievementsFor` on the fields they read. Measured, that cost more than it saved: sets touch sfx's fields 86% of the time, chatter's 72%, tips' 53% and achievements' 29%, and each diff already returns early on what it doesn't need. Comparing their fields on every set first made them 1.5–4× slower (picking the fields into an object for `shallow`, up to 20×), so they run on every set as before, through `subscribeDiff`.
- What did stay gated is where the work is real in the browser: music touches its Web Audio nodes only when the track or the muffle changes (before, on every clock step and customer change), the trophy case reads and parses localStorage only when achievements or records change, autosave does nothing until the day is settled, and `scene/runtime`'s grid syncs only on their own fields.

## 18d: simulation and frame-loop hot paths (2026-10-11)

The crowd is gathered and bucketed once a frame, walkers step without allocating, an unreachable goal is turned down without a search, and the one replay left is remembered.

### Crowd, one frame of 60 walkers (`src/sim/crowd.bench.ts`, µs per frame at 60 fps and 1×)

| Run                                         | µs per frame |
| ------------------------------------------- | ------------ |
| Before (18c's code, three runs)             | 256–360      |
| 18c's way on 18d's step (a list per walker) | 213–223      |
| After: gathered once, `SpatialHash`         | **67–69**    |

- 60 walkers mill about the front lot and showroom, each taking its substep among the others, as `moveAlong` does. Before, every walker gathered its own list of everyone (60 new objects and a tile each) and checked all 60; after, the crowd is gathered once a frame into reused objects, hashed into 1-tile cells, and each walker checks only the cells within `SEP_RADIUS` plus how far anyone could walk in the frame.
- The middle row is the old gathering with 18d's allocation-free step (`canStand` no longer makes arrays and tiles, `stepAlongPath`, `separation` and `moveWithCollision` write into out parameters): about 15% of the cut is the step, the rest is the hash and gathering once.
- About 0.2 ms a frame saved on this machine at 60 walkers, more on a phone. The busy day has about 30.

### A* on the full map, every expansion up (`src/sim/pathfinding.bench.ts`, µs per search)

| Search                                | Before  | After       |
| ------------------------------------- | ------- | ----------- |
| Across the front lot                  | 19–22   | 18–23       |
| Sidewalk to the east lot's far corner | 159–168 | 163–168     |
| A walled-in goal                      | 476–487 | **0.2–0.3** |
| A walled-in goal, after a grid change |         | **23–25**   |

- 13c's heap A* holds up at 60 × 30: a cross-map path is about 0.16 ms. No path spikes showed besides the unreachable goal, which searched every tile it could reach first; `pathTo` can try four goal lists in a row, so a walker with nowhere to go cost up to 2 ms on this machine. Now `Grid.area` labels connected areas once per grid change (about 24 µs on the full map) and `findPathToAny` turns down a goal in another area at once. No path cache: nothing left to cache.

### Replays

`lastTheftNight` (behind `isTheftNight`, the tests and the v18 save upgrade) replayed every night from day 6; it's remembered now, like `weatherOn`. The game itself hasn't replayed since 14d (`theftNightAfter` with `Rival.lastTheftDay`). The tests' 2,000-day `isTheftNight` check went from 236 ms to 3 ms. No other function replays from day 1.

### Sim bench

| Level  | ms/day first 50 | middle 50 | last 50 | ms/tick mean | Sales | Save at day 500 |
| ------ | --------------- | --------- | ------- | ------------ | ----- | --------------- |
| Medium | 6.9             | 6.9       | 4.3     | 0.067        | 2,954 | 163 KB          |
| Hard   | 3.9             | 2.2       | 1.9     | 0.038        | 771   | 126 KB          |

- Flat from day 1 to day 500, and both levels play out exactly as after 18b (the same sales and save sizes): 18d changed no behaviour the bench can see.

### `@perf` overlay, busy day (SwiftShader)

| Speed | fps, 18c | 18d | p95 frame, 18c | 18d    | Draw calls | Sets/s | Listener ms/s |
| ----- | -------- | --- | -------------- | ------ | ---------- | ------ | ------------- |
| 1×    | 3.3      | 3.2 | 778 ms         | 781 ms | 616        | 0.47   | 0.03          |
| 4×    | 2.5      | 2.4 | 806 ms         | 837 ms | 618        | 3.15   | 0.35          |

- No change, as expected: SwiftShader's frames take about 300 ms of rendering, and 18d saves a fraction of a millisecond of script. The readings that can show it are a real device's frame time on a busy day at 4×, where the crowd steps the most.
- `CameraRig` now calls `updateProjectionMatrix` only while the zoom eases (R3F and drei redo it when the viewport changes). It's microseconds a frame, too small for any reading here; it's kept because it costs nothing.

### Desktop, Chrome, busy day (Medium, rain, local preview, full window)

| When        | Speed | fps  | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` | Heap  |
| ----------- | ----- | ---- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- | ----- |
| 18a         | 1×    | 30.0 | 45 ms     | 738 / 828               | 252k      | 662        | 128      | 2.2    | 0.16          | 20     | 15       | 91 MB |
| 18c (10-11) | 1×    | 28.8 | 47 ms     | 758 / 899               | 250k      | 972        | 131      | 2.8    | 0.16          | 20     | 15       | 92 MB |
| 18d (10-11) | 1×    | 28.4 | 45 ms     | 798 / 891               | 258k      | 539        | 129      | 1.8    | 0.14          | 20     | 15       | 79 MB |

- No change in frame rate, within the run-to-run noise, as with 18c: full-window on the desktop is bound by fill (18a's 800×600 reading), and 18d cut only script. The draw calls are a little higher because more of the lot was in view (the camera isn't fixed between runs); 18d doesn't change what's drawn.
- The heap read 79 MB against 91–92 MB before. That fits 18d's frame loops no longer making garbage each frame, but it's one run and the heap moves with collection timing, so it's a hint, not a finding.
- Geometries climbed 180 → 539 and textures 70 → 129 over 6.3 minutes of readings: the same unexplained climb, still for 18e to find first.
- Only 1× was played: the local preview is a production build, which has no speed-up.

### iPhone, Chrome, busy day (rain, local preview)

| When                | Speed | fps  | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` |
| ------------------- | ----- | ---- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- |
| 18a (Hard)          | 1×    | 59.6 | 18 ms     | 593 / 755               | 198k      | 505        | 124      | 2.6    | 0.31          | 20     | 14       |
| 18c (10-11, Medium) | 1×    | 59.4 | 18 ms     | 491 / 585               | 174k      | 381        | 130      | 2.2    | 0.25          | 20     | 14       |
| 18d (10-11)         | 1×    | 59.4 | 20 ms     | 495 / 560               | 177k      | 440        | 127      | 2.7    | 0.30          | 20     | 15       |

- Still a steady 60 fps, the display's cap, so 18d's saving can't show as frames at 1×. The p95 of 20 ms against 18 ms is one run, within the noise (a few slow frames move it).
- Geometries climbed 126 → 440 and textures 65 → 127 over 6.0 minutes of readings: the same climb, for 18e.
- Neither device shows 18d: the desktop is bound by fill, and the phone has headroom at 1×. Its gain is in the benches (the crowd's frame 3–4× cheaper, no unreachable-goal searches), and in less garbage, which the desktop's lower heap hints at.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- `check`: lint, `prettier --check`, unit tests and the build;
- `e2e`: the Playwright smoke tests, run after `check` passes, with the browsers cached.

A newer push cancels a run still going on the same branch. The bench and the `@perf` scenario aren't run in CI, because shared runners are too noisy to time on.

## 18e: rendering, loading and storage (2026-10-11)

### The geometry climb, found

The geometries that climbed all day in 18a–18d (to 500–1,300 on the real devices) were the hover outlines. drei's `Outlines` draws each outline from a creased copy of the mesh's geometry and means to free it on unmount, but its cleanup reads a ref that React 19 has already cleared by then, so every hover (or tap) leaked one geometry per mesh outlined. The headless e2e run never hovers, which is why it never climbed. A probe that swept the mouse over the busy lot took the geometries from 149 to 202 in one sweep, and they stayed there. `MeshOutline` (`scene/Interactable.tsx`) now frees the copy and its material itself: three sweeps later the count held at 114.

### `@perf` overlay, busy day (SwiftShader, same session, before on 18d's commit)

| Speed | fps, before | after | p95 frame, before | after  | Draw calls, before (mean / max) | after (mean / max) | Triangles, before | after | Geometries, before | after  | Heap, before | after |
| ----- | ----------- | ----- | ----------------- | ------ | ------------------------------- | ------------------ | ----------------- | ----- | ------------------ | ------ | ------------ | ----- |
| 1×    | 3.2         | 3.4   | 845 ms            | 808 ms | 615 / 630                       | **270 / 287**      | 229k              | 228k  | 149                | **67** | 93 MB        | 82 MB |
| 4×    | 2.0         | 2.6   | 912 ms            | 800 ms | 617 / 632                       | **274 / 287**      | 230k              | 223k  | 149                | **67** | 93 MB        | 82 MB |

- **Draw calls down 56%**, against a target of a third. Most of it is the cars: each was 5–6 meshes (body and wheels, one material), drawn again in the shadow pass, so 44 cars cost about 500 calls; `scripts/compress-models.mjs` joins each into one mesh. The floors, parking stripes and road dashes went from about a hundred meshes to one per colour (`mergePlanes`), the lit sign's bulbs are one instanced mesh, and small furniture (`SMALL`) and the desk phone no longer cast shadows.
- Geometries halved: each car is one geometry, the floors a dozen. Cars now share one material per source material, dirt step and wear step (`tintedMaterial`) instead of a copy each.
- SwiftShader's fps measures the CPU, and Auto quality stepped down to the lowest tier within the first seconds here (its frame rate is far under the bounds), so the fps and p95 aren't comparable with the before column. The draw calls are: drawing at a lower tier changes the pixels and the shadow map's size, not the meshes drawn.
- React's commits per game minute at 1× read 2.15 against 0.6: the two steps down early in the run (each re-renders the lights and remounts the rain). At 4× they read 1.35 against 1.45.
- Screenshots at High and Low (`graphics` set before loading) against 18d's: the cars, floors, stripes and dashes look the same at game zoom. Low has softer shadows and a third of the rain.

### Loading (`npm run build`)

| What                                   | 18a                     | 18e                                                       |
| -------------------------------------- | ----------------------- | --------------------------------------------------------- |
| JS loaded before the title screen (gz) | 483 KB, one chunk       | **457 KB**: the game 122 KB and `vendor-three` 334 KB     |
| JS loaded later (gz)                   |                         | Guide 13.5 KB, office computer 12.3 KB, summary 3.7 KB, … |
| Models in `public/models`              | 4.5 MB (4.07 MB of GLB) | **1.50 MB** (meshopt, quantized, unused clips dropped)    |
| Models fetched before the title screen | all, 4.07 MB            | **1.09 MB**: day one's 15 furniture, 5 cars, 8 characters |
| **First load** (JS and models)         | **about 4.7 MB**        | **about 1.6 MB, 67% less** (target: 40%)                  |

- `HowToPlay`, `AudioPanel`, `StockPanel` (with its tabs) and `DaySummary` load in their own chunks, fetched when the browser is idle after the title screen is up, so none waits on the network when opened. three.js, R3F and drei are the `vendor-three` chunk, cached apart from the game's code, which changes every release.
- Models load with drei's meshopt decoder. Luxury cars, the wing's and the improvements' furniture, and staff and Nazma's characters load the first time they're drawn, each in its own Suspense.
- Audio: the music's `.mp3` copies are gone (8.9 MB), leaving `public/audio` at 6.6 MB (16 MB before). Every current browser plays OGG Vorbis, Safari since iOS 18.4 and macOS 15.4; the sound effects were already OGG only. An older iPhone plays the game silent. The music was never part of the first load (each track streams when it first plays), so this saves hosting, not load time.

### Quality tiers and idle frames

- Graphics **Auto / High / Low** (the 🔊 panel; a device preference). Tiers: DPR 2 / 4096 shadow map / 1,400 drops, then 1.5 / 2048 / 900, then 1 / 1024 / 450. Auto starts at the top on a desktop and a step down on a phone, steps down after about 5 s under 45 fps, steps up after about 5 s over 57 fps at most once a minute, and never climbs back to a tier it fell from, so it can't flicker. The bounds are fixed: drei's default guesses the refresh rate from the best fps seen, so a desktop stuck at 30 would never have stepped down.
- The canvas draws only on demand while nothing moves: the title screen, the guide, the rotate prompt and the day summary.
- Desktop Chrome, busy day (2026-10-11, Medium, rain, local preview, full window, Auto, 6.4 minutes of readings): it read tier 1 early on and stepped down to tier 2 (DPR 1, 1024 shadow map) around 9:40 in the game, and the frame rate stayed high from there:

| When      | Speed | fps      | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` | Heap  |
| --------- | ----- | -------- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- | ----- |
| 18d       | 1×    | 28.4     | 45 ms     | 798 / 891               | 258k      | 539        | 129      | 1.8    | 0.14          | 20     | 15       | 79 MB |
| 18e, Auto | 1×    | **55.1** | **26 ms** | **337 / 453**           | 244k      | **117**    | 117      | 3.6    | 0.21          | 20     | 15       | 68 MB |

- Nearly twice the frame rate, as 18a's 800×600 reading predicted: full-window was bound by fill, and Auto's lowest tier draws a quarter of tier 0's pixels. The draw calls are 58% lower.
- Geometries went from 79 to 117 over the day, against 180 to 539–972 before: the climb is gone. What's left is models loading as they're first drawn (staff, Nazma, luxury cars), which levels off. Textures did the same, 51 to 117: each compressed model carries its own copy of its kit's small colour map.
- iPhone, Chrome, busy day (2026-10-11, rain, local preview, Auto, 6.1 minutes of readings): it started a step down, on tier 1, and stepped up to tier 0 around 10:40 in the game, as Auto allows once it holds the frame rate:

| When      | Speed | fps  | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` |
| --------- | ----- | ---- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- |
| 18d       | 1×    | 59.4 | 20 ms     | 495 / 560               | 177k      | 440        | 127      | 2.7    | 0.30          | 20     | 15       |
| 18e, Auto | 1×    | 58.6 | 20 ms     | **232 / 311**           | 193k      | **102**    | 117      | 2.2    | 0.44          | 21     | 15       |

- Still at the display's cap (the 58.6 includes the tier-1 start and the step up), now with less than half the draw calls. Geometries went from 62 to 102 and level off, as on the desktop: the climb is gone on both devices.
- Both devices found their own tier: the desktop full-window settled on the lowest (fill-bound), the phone climbed to the top. That's what Auto is for.

### Storage

At day 500 (`npm run bench`, Medium): the save is 163 KB, `createSave` 0.9 ms and `parseSave` 1.4 ms (Hard: 126 KB, 0.6 and 1.0 ms), well inside the 500 KB and 20 ms targets and far from the 1 MB that would have called for delta-encoded day logs, so the save format is unchanged. If the browser refuses the end-of-day write (a full quota or blocked storage), the game now shows "Couldn't save today" and plays on. Why there's no server, and what would reopen it: `docs/ARCHITECTURE.md`.
