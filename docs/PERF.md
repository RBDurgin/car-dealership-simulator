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
- **Sim bench**: `npm run bench` (not part of `npm test`). `src/state/bench/longGame.bench.ts` plays 500 days headless on Medium and Hard with `bench/bot.ts`, a busy but simple player: it serves one deal at a time (taking each counter), orders stock and ads each morning, and buys expansions when its rank allows. It prints ms per day (first, middle and last 50 days, which should stay flat), ms per `tickClock`, what got played, and the day-500 save's size and times, then benches `createSave` and `parseSave` on that save. The store's rngs are seeded by the day, so a run plays the same each time; the timings are noisy run to run (±30% on a day window), so compare a few runs.
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

| Where                       | Speed | fps                       | p95 frame | Draw calls (mean / max) | Triangles | Geometries | Textures | Sets/s | Listener ms/s | People | `<Html>` | Heap  |
| --------------------------- | ----- | ------------------------- | --------- | ----------------------- | --------- | ---------- | -------- | ------ | ------------- | ------ | -------- | ----- |
| SwiftShader (e2e, headless) | 1×    | 2.9                       | 947 ms    | 615 / 632               | 229k      | 149        | 72       | 0.8    | 0.43          | 27     | 13       | 98 MB |
| SwiftShader (e2e, headless) | 4×    | 2.0                       | 803 ms    | 616 / 632               | 230k      | 149        | 78       | 4.0    | 0.55          | 29     | 18       | 98 MB |
| Desktop Chrome              | 1×    | _to measure with `?perf`_ |           |                         |           |            |          |        |               |        |          |       |
| Mid-range Android           | 1×    | _to measure with `?perf`_ |           |                         |           |            |          |        |               |        |          |       |
| iPhone, Chrome, quiet day   | 1×    | 60                        | 17 ms     | 372                     | 104k      | 438        | 129      |        |               |        |          |       |
| iPhone, busy day            | 1×    | _to measure with `?perf`_ |           |                         |           |            |          |        |               |        |          |       |

- The draw calls (about 615 on a busy day) fall at the top of the planning estimate of 300–600. 18e's target is at least a third fewer.
- The real-device rows are for Robert to fill: open the game with `?perf=busy`, start a new game, play the day out at 1× (or at 1× then 4×), and copy the rows from the day summary.
- iPhone, quiet day (2026-10-10): a steady 60 fps (p50 and p95 both 17 ms), the display's cap, so there's headroom that this reading can't show. Chrome on iOS runs on WebKit, so it stands in for Safari. A busy day is still to measure.
- The iPhone held 438 geometries and 129 textures on a quiet day, against 149 and 72–87 on the e2e busy day, which had more on screen. It may be the longer session: characters are cloned on every spawn (see 18e). 18e should check whether these counts keep climbing over a long session.

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

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- `check`: lint, `prettier --check`, unit tests and the build;
- `e2e`: the Playwright smoke tests, run after `check` passes, with the browsers cached.

A newer push cancels a run still going on the same branch. The bench and the `@perf` scenario aren't run in CI, because shared runners are too noisy to time on.
