# Phase 18 Plan: Architecture and Performance Review

**Status:** planned 2026-10-08. Phase 18 comes after Phase 17. It reviews the game as Phases 13–17 leave it. Each sub-phase starts by re-measuring, because 13c already plans some perf work: binary-heap A*, a shadow camera that follows the view, shared car materials, and culling `<Html>` badges. Anything 13c already landed is checked and skipped. Phase 18 changes no rules and no balance, and doesn't touch the save format unless 18e has to. After that, we do one sub-phase per session and stop for Robert's review after each, as in earlier phases.

## Context

Seventeen phases have each added one more slice to the game, and the structure hasn't been looked at as a whole. The review at planning time (2026-10-08, after Phase 13a) found these problems:

- **One big store.** `state/store.ts` is about 1,640 lines: one `create<GameState>` with 41 fields, 62 actions and about 25 private helpers in the closure.
  - Phases 13b–17 add about five more top-level slices: `rival`, `service`, `clients`, `log` and `achievements`, on top of 13a's `career`.
  - `commit` does seven jobs, `beginDay` is 80 lines, and `settleDay` is called twice per tick (`commit` and `tickClock`).
  - Module-level rngs and id counters aren't reset with the state, so the store tests depend on their order.
  - The store imports `formatMoney` from `ui/format`, which is a layering inversion.
- **Wide subscriptions.**
  - Twelve `subscribe` listeners run on every `set()`. One tick makes 3–6 unbatched `set()` calls.
  - Several components select whole arrays: `ActionMenu` takes `customers`, `roster` and `inventory`, even when it's closed. `scene/Customers` and `DaySummary`/`GoalBanner` take all of `dayStats`.
  - Some selectors do O(n) or O(n²) work on every set: `CustomerBubble` runs a `customers.find` for each customer.
  - `useShallow` is used twice.
- **Per-frame hot paths.**
  - `walker.moveAlong` rebuilds `crowdAgents()` once per walker per substep, a fresh array of fresh objects. `crowd.separation` is O(n²) and allocates as it goes.
  - The scene loops allocate new `Set`/`Map` objects and spread arrays every frame.
  - `CameraRig` calls `updateProjectionMatrix` every frame.
  - `isTheftNight` replays every night from day 6 on each `beginDay`.
- **Rendering.**
  - `<Canvas>` uses `frameloop="always"`, with no adaptive quality and the shadow map size fixed at load.
  - Nothing is instanced except walls and rain. Each car is a deep clone with its own materials, and floors and road dashes are one mesh each.
  - Sign bulbs swap material every frame.
  - Each character is a fresh `SkeletonUtils.clone` with its own mixer on every spawn.
  - Our estimate is 300–600 draw calls on a busy day, unmeasured.
- **Loading.**
  - It's one JS chunk, and drei `Stats` is always imported.
  - The 4.5 MB of GLBs are uncompressed and all preloaded.
  - 16 MB of audio ships both `.ogg` and `.mp3` for every track.
- **No CI.** There is no `.github/`, so lint, typecheck, tests and build only run when someone remembers. The game is hosted as a static site on Vercel, outside this repo.

**Decisions made with Robert (2026-10-08):**

- **No backend.** The game stays fully client-side with a single localStorage save.
  - Nothing in Phases 12.5–17 needs a server. Leaderboards, sharing and online reviews are all in their Left out lists.
  - The saves stay small: a few KB today, plus about 50 KB for a full client book and about 15 KB a year of day log.
  - 18e writes the decision down, with the conditions that would reopen it, and makes the local save robust.
- **After Phase 17.** The review runs on the finished feature set, not before it.
- **GitHub Actions CI**, added in 18a. Hosting stays on Vercel and isn't changed here.
- **Measure first.** Every optimisation needs a before and after number from 18a's tools. A change that doesn't move a number gets reverted.

## Levers that already exist

| Lever                                    | Where                                       | Phase 18 use                                                           |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `?fps` flag, drei `Stats`                | `scene/Scene.tsx`                           | Grows into a `?perf` overlay: fps, draw calls, triangles, store sets/s |
| `SHADOW_MAP_SIZE`, `COMPACT`/`COARSE`    | `scene/Scene.tsx`, `input/useMediaQuery.ts` | Starting tier for adaptive quality                                     |
| `isPaused`                               | store                                       | Drives `frameloop` when nothing moves                                  |
| `crowdAgents`, `crowdStep`, `separation` | `scene/runtime.ts`, `sim/crowd.ts`          | Built once per frame; spatial hash for separation                      |
| `findPath` (heap after 13c)              | `sim/pathfinding.ts`                        | Verify 13c's version; add a path cache only if measured                |
| `weatherOn` memo                         | `sim/weather.ts`                            | Same pattern for `isTheftNight`                                        |
| `levelTuning`, `tuning()`                | `sim/difficulty.ts`, store                  | Kept as is; moved into the slice helpers                               |
| `parseSave`, `UPGRADES`                  | `sim/save.ts`                               | Benchmarked at day 500 with Phase 16/17 data                           |
| Playwright smoke + `e2e/game.ts`         | `e2e/`                                      | A perf scenario reads `renderer.info` and fps                          |
| `useShallow`                             | `scene/useUpNow.ts`                         | The pattern for the selector fixes                                     |

## Sub-phases

### 18a: Baseline, profiling tools and CI

- **`?perf` overlay** (`ui/PerfOverlay.tsx`, lazy-loaded only with the flag). It replaces the `?fps` `Stats` and shows:
  - fps and frame time (p50/p95);
  - `renderer.info.render.calls`, `triangles` and `geometries`/`textures`;
  - store `set()` calls per second and time spent in `subscribe` listeners, counted by a dev-only wrapper in `state/perf.ts`;
  - active walkers and `<Html>` overlays.
- **Sim benchmark.** `src/sim/bench/longGame.bench.ts` uses `vitest bench`, so it isn't part of `npm test`. It drives the store headless for 500 days (`beginDay` → `tickClock` to close → `settleDay`) on Medium and Hard with a fixed seed, and records:
  - ms per day;
  - ms per `tickClock`;
  - `createSave`/`parseSave` time and save size in bytes at day 500.
- **Browser perf scenario.** `e2e/perf.spec.ts` is tagged `@perf` and left out of the default `npm run e2e`. Run it with `npm run e2e:perf`. It loads a busy late-game state through `useGame.setState` with a full lot, full staff, 12 customers, rain and Nazma. It runs 30 s at 1× and 4×, then writes fps, draw calls and heap size to `e2e/perf-results.json`.
- **`docs/PERF.md`**: the baseline table (desktop Chrome, SwiftShader e2e, mid-range Android, iPhone if one is available) and the bundle sizes from `vite build`. Each later sub-phase adds its after numbers.
- **CI.** `.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:
  - job `check`: Node from `.nvmrc` (added), `npm ci`, `npm run lint`, `npx prettier --check .`, `npm test`, `npm run build`;
  - job `e2e` (needs `check`): Playwright Chromium with `npm run e2e`, uploading the report when it fails.
  - Cache npm and the Playwright browsers.
  - It doesn't deploy. Vercel builds previews itself.
- Tests: none new beyond the bench. CI going green on its own PR is the check.

### 18b: Store split and layering

No behaviour change. Every existing store test passes untouched, and that is the proof.

- **Split `state/store.ts` into slices** (zustand slice pattern, one `GameState` type):
  - The slices live in `state/slices/`: `clock.ts`, `economy.ts` (cash, orders, floor plan, quota, purchases), `customers.ts`, `staff.ts`, `world.ts` (improvements, expansions, weather, Nazma, rival), `day.ts` (`beginDay`, `settleDay`, `dayOne`), `career.ts` (rank, log, lifetime, achievements, clients) and `ui.ts` (menus, panels, `computerTab`, `timeScale`, dev flags).
  - `state/store.ts` keeps only `create`, the `GameState` type and its re-exports, so imports elsewhere don't change.
  - Helpers shared between slices (`commit`, `dispatch`, `tuning`) go in `state/core.ts` and take `get`/`set`.
- **Split `commit`.** Its seven jobs (close reduction, `callNextBuyer`, browse dirt, departures, menu/hover cleanup, receptionist notices, `settleDay`) become named steps run in order. `settleDay` is called in exactly one place.
- **One `set()` per tick.** `tickClock` builds the next state through the steps and commits once, so listeners and selectors run once per step instead of 3–6 times. The same goes for `beginDay`.
- **Move sim logic out of the store** into pure, tested functions:
  - `arrivalScale(day, weather, event, tuning, reputation)` in `sim/customers.ts`, replacing the two copies in `dayOne` and `beginDay`;
  - `saleRecord(...)` in `sim/deal.ts`, taken from `sign`;
  - `patienceDrain(...)` in `sim/customers.ts`, taken from `tickClock`;
  - `departingOnFire(customers, employeeId)` in `sim/staff.ts`, taken from `fire`.
- **Fix the layering.** `formatMoney` moves to `sim/format.ts` (pure); `ui/format.ts` re-exports it. Add an oxlint `no-restricted-imports` rule so `sim/` can't import from React, three or `ui/`, and `state/` can't import from `ui/`.
- **Resettable runtime.** The module-level rngs and id counters move into `state/rng.ts`, with `resetRng(seed)` called by `newGame` and by the test helper, so store tests no longer depend on their order.
- Tests: the existing 70+ files, unchanged. New unit tests for each moved pure function, plus `rng.test.ts` (the same seed gives the same day-one customers).

### 18c: Subscriptions and selectors

- **Selector fixes.** Each component takes only what it renders:
  - `ActionMenu` selects nothing while `menu` is null, then only the menu target's customer, employee or car through one `useShallow` selector.
  - `scene/Customers` selects the customer id list with `useShallow`, and each `CustomerView` selects its own customer by id. This removes the O(n²) `find` in each bubble.
  - `DaySummary`, `GoalBanner`, `StockPanel` and `StaffPanel` select the fields they draw. Derived values (`sellerBonusFor`, `installed(...)`, `lotSlotFor`, `buyBlocker`) go through small memoised selectors in `state/selectors.ts`, keyed on their input references.
  - `Props`, `TubeMan` and `scene/runtime` read `installed()` from one cached `upNow` value that is recomputed only when `improvements` or `day` change.
- **One listener helper.** `subscribeTo(selector, onChange, equal?)` in `state/subscribe.ts` (or zustand's `subscribeWithSelector` middleware). It moves all 12 listeners off whole-state diffs:
  - `sfxFor`, `reactionsFor` and `tipFor` keep their `prev`/`next` signature, but run only when one of the fields they read changes.
  - Autosave runs only on `dayStats.settled`.
  - Music runs only on the clock's day part, `dayOver` and the muffle flags, not on `customers`.
- **Frame-loop store calls.** Calls like `onArrived`, the `staffClaim` retry and the Nazma reports run only on a state change, not every frame while someone stands still. A failed `staffClaim` waits for the customers reference to change before it tries again.
- Tests: `selectors.test.ts` (each memoised selector returns the same reference for unchanged inputs) and `subscribe.test.ts`. The perf overlay's sets/s and listener time before and after go in `docs/PERF.md`.

### 18d: Simulation and frame-loop hot paths

- **Crowd.**
  - `crowdAgents()` is built once per frame into a reused array, with the frame number as a cache key in `scene/runtime.ts`. Walkers and `DrivenCar` read the cached array.
  - `separation` uses a uniform spatial hash with 1-tile cells, rebuilt once per frame, so each agent checks only its own and nearby cells. Results go into a reused scratch vector.
  - `crowdStep` returns into an out parameter.
  - The algorithm stays the same, so the existing `crowd.test.ts` cases must pass. Add a bench at 60 agents.
- **Allocations.** The per-frame `new Set`/`new Map`/spread in Customers, Staff, Pedestrians, DrivenCars and Chatter become module-level scratch collections that are cleared each frame. Vector temporaries are hoisted.
- **Camera.** `CameraRig` calls `updateProjectionMatrix` only when zoom or the viewport changes.
- **Pathfinding.**
  - Check 13c's heap A* at the final grid size.
  - If 18a shows path spikes, add a per-day `pathCache` for static start/goal pairs (door → platform, desk → chair), cleared when `improvementFootprints` or expansions change the grid.
  - Unreachable goals stop early through a reachability check: connected-component labels built once per grid change.
- **Replays.** `isTheftNight` gets a memo like `weatherOn`. Any Phase 13–17 function that replays from day 1 gets the same treatment, and the 18a bench must show ms per day flat from day 1 to day 500.
- Tests: the existing `crowd`, `pathfinding` and `nazma` tests, plus new tests for the spatial hash (same neighbours as brute force on random layouts) and the connected-component labels. Any path cache is invalidated when the grid changes.

### 18e: Rendering, loading and storage

- **Adaptive quality.**
  - drei `PerformanceMonitor` steps through three tiers: DPR 2 → 1.5 → 1, shadow map 4096 → 2048 → 1024, and the rain count.
  - It starts from the `COMPACT`/`COARSE` tier.
  - A tier only steps down after sustained low fps, and steps up at most once a minute so it doesn't flicker.
  - A **Graphics: Auto / High / Low** setting goes in the sound panel's settings area. It's kept in localStorage like the audio preference, not in the save.
- **Idle frames.** `frameloop` switches to `demand` while `isPaused` (guide, rotate prompt, day summary, title), and back to `always` on resume.
- **Draw calls.**
  - Floors, parking stripes and road dashes are merged into one geometry per material at layout build. They're rebuilt only when the layout changes (13d's parcel).
  - Sign bulbs become one `InstancedMesh` with per-instance colour, so no material swaps.
  - Cars get shared materials per model and tint step, if 13c hasn't done it already.
  - Shadow casting is turned off for small props that don't read in the shadow, like bulbs, dashes and small furniture.
  - Target: the busy-day draw calls in `docs/PERF.md` cut by at least a third.
- **Characters.** Pedestrians draw from a pool of pre-cloned rigs (`scene/characterPool.ts`, sized to the pedestrian cap), reused on despawn instead of a fresh `SkeletonUtils.clone`. Customers and staff keep their own clones.
- **Assets.**
  - Compress the GLBs with `gltf-transform` (meshopt and quantize) through a checked-in `scripts/compress-models.mjs`. The originals stay in `assets-src/`, outside `public/`.
  - drei `useGLTF` is passed the meshopt decoder.
  - Target: the 4.5 MB of models down to under 2 MB, with no visible change at game zoom.
  - Preload only the models day one needs. Luxury and expansion-only models load on first use.
- **Bundle.**
  - `manualChunks` splits off `three`/R3F/drei as a vendor chunk.
  - `React.lazy` loads `HowToPlay`, the office computer tabs (Stock, Marketing, Upgrades, Calendar, Stats, Achievements, Clients), `DaySummary` and `AudioPanel`.
  - `Stats`/`PerfOverlay` load only with the flag.
  - Record the before and after sizes in `docs/PERF.md`.
- **Audio.** Ship `.ogg` only if every target browser plays it: Safari 17+ does. Check the iOS version floor in `docs/PERF.md` first. Otherwise keep the `.mp3` and leave this out.
- **Storage robustness** (no backend; see Context):
  - `state/persistence.ts` wraps `setItem` in try/catch. On `QuotaExceededError` it shows a notice ("Couldn't save today") and keeps the game running.
  - `parseSave` and `createSave` are benchmarked at day 500 with a full client book and day log in the 18a bench. Target: under 20 ms each, and the save under 500 KB.
  - If the save size passes 1 MB in the bench, the day log saves as delta-encoded tuples. That takes the next free save version, with an `UPGRADES` step. It's the only save change Phase 18 may make.
- **Backend decision record.** `docs/ARCHITECTURE.md` (new) describes:
  - the layers (`sim` / `state` / `scene` / `ui` / `audio` / `input`) and what each may import;
  - the store slices and the one-set-per-tick rule;
  - the runtime maps;
  - why there's no server, and the triggers that would reopen it: cloud saves across devices, online leaderboards or sharing, accounts, or a save that outgrows localStorage.

  It also notes that file export/import of the save would be the next step before any server.

- Tests: the existing scene-free unit tests. Visual checks are by screenshot (below).

## Performance targets

- A busy late-game day on a mid-range Android phone holds **55 fps or more** at 1×. That's 5 above 13c's target of about 50, with the wing built.
- Draw calls on that day are at least a third lower than the 18a baseline.
- At most one store `set()` per clock step, and listener time under 1 ms per step.
- The sim bench shows ms per day flat from day 1 to day 500, with no growth from replays.
- First load (JS plus models fetched before the title screen) is at least 40% smaller than the 18a baseline.
- No change in behaviour: all the unit tests pass unedited after 18b, 18c and 18d.

## Help (every sub-phase)

Phase 18 adds nothing the player does, apart from the **Graphics** setting in 18e.

- That setting goes in the Controls tab of `ui/HowToPlay.tsx` and gets one line in the sound and settings panel.
- `ui/controls.ts` doesn't change.
- What's new (12.5): one `UPDATES` entry, under `phase: '18'`, for 18e (smoother play and the Graphics setting). 18a–18d change nothing on screen.

## Verification (each sub-phase)

- `npm test`, `npm run lint`, `npx prettier --check .`, `npm run build` and `npm run e2e`, all green, and CI green on the PR from 18a on.
- `npx vitest bench` (18a on): compare ms per day, ms per tick and save size with `docs/PERF.md`, and record the new numbers.
- `npm run e2e:perf`: compare fps, draw calls and heap with the baseline, and record them.
- `npm run dev` with `?perf` (or `/run`):
  - play a full day at 1× and at 4×;
  - check that customers, staff, cars, Nazma, rain and the summary behave as before;
  - take before and after screenshots at the same camera for 18e's merged floors, instanced bulbs, compressed models and each quality tier.
- On a real phone, play a full busy day on Auto quality. Note the fps and any tier changes.
- 18b: `git diff --stat` shows no test file edited except for added tests.

## Left out

Robert left these out on 2026-10-08. They could make a later phase:

- Any server, cloud save, accounts, leaderboards or telemetry.
- Save export and import as a file. `docs/ARCHITECTURE.md` notes it as the first step if cross-device saves are ever wanted.
- Moving the simulation into a Web Worker. The sim's cost per tick is small, and frame time is spent in rendering and the crowd.
- Instancing the skinned characters (GPU skinning, baked animation textures).
- Changes to Vercel hosting or cache headers.
- A React component test setup (jsdom).
