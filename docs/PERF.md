# Performance

Phase 18 measures before it optimises: every change in 18b–18e needs a before and after number from the tools below, and a change that doesn't move a number gets reverted. This file keeps the baseline (18a, 2026-10-10) and each sub-phase adds its after numbers under it.

## Tools

- **`?perf` overlay** (`scene/PerfOverlay.tsx`, lazy-loaded only with the flag; `?fps` still works). Add `?perf` to the game's URL. It shows:
  - fps and frame time (p50/p95 over the last couple of seconds);
  - the last frame's draw calls and triangles (shadow passes included), and the geometries and textures the renderer holds;
  - store `set()` calls per second and ms per second spent in `useGame.subscribe` listeners (`state/perf.ts`; components' selectors aren't timed);
  - people in the world (player included), visitors' cars and `<Html>` badges.
  - At the end of each day, the day summary shows the day's readings (only those taken while the day was played) as rows for the device table below, one per game speed played, with a **Copy** button. Under them it shows the renderer's geometries and textures at the day's first and last readings, to show whether they climb. On the first day played, the first reading comes while models are still loading.
- **`?perf=busy`**: a new game jumps straight to the busy late-game day (`state/perfScenario.ts`, the same scene the `@perf` e2e scenario measures): every expansion, 44 cars, 12 staff, 12 customers at once, rain and Nazma on his way. Such a game is never saved and leaves the trophy case alone, so it's safe on the deployed site. Continuing a save with the flag on isn't changed, but isn't saved either.
- **Sim bench**: `npm run bench` (not part of `npm test`). `src/state/bench/longGame.bench.ts` plays 500 days headless on Medium and Hard with `bench/bot.ts`, a busy but simple player: it serves one deal at a time (taking each counter), orders stock and ads each morning, and buys expansions when its rank allows. It prints ms per day (first, middle and last 50 days, which should stay flat), ms per `tickClock`, store sets per `tickClock` and per `startNextDay` (each set runs every listener; added in 18b), what got played, and the day-500 save's size and times, then benches `createSave` and `parseSave` on that save. The store's rngs are seeded by the day, so a run plays the same each time; the timings are noisy run to run (±30% on a day window), so compare a few runs.
- **Browser perf scenario**: `npm run e2e:perf` (tagged `@perf`, left out of `npm run e2e` and CI). `e2e/perf.spec.ts` starts a game with `?perf=busy` and reads the overlay once a second for 30 s at 1× and at 4×. It writes `e2e/perf-results.json`, then closes the day and checks the summary's report. Screenshots go to `test-results/perf-busy.png` and `test-results/perf-report.png`. Under SwiftShader the fps measures the CPU, not a GPU; the draw calls, triangles, store sets and walkers are what to compare there.

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

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- `check`: lint, `prettier --check`, unit tests and the build;
- `e2e`: the Playwright smoke tests, run after `check` passes, with the browsers cached.

A newer push cancels a run still going on the same branch. The bench and the `@perf` scenario aren't run in CI, because shared runners are too noisy to time on.
