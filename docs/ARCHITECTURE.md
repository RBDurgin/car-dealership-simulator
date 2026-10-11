# Architecture

How the game is put together, as Phase 18 left it (2026-10). The phase plans in `docs/` say how each feature came about; this file says how the parts fit and why there's no server. Performance numbers are in `docs/PERF.md`.

## Layers

The game is a static site: Vite builds it, Vercel hosts it, and everything runs in the browser.

| Layer    | What it holds                                                                                                                         | May import                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `sim/`   | The rules, as pure TypeScript: the grid and pathfinding, customers, deals, money, staff AI, the save format. Unit tested with Vitest. | Only `sim/`                                                                        |
| `state/` | The zustand store, its slices, derived reads and selectors, persistence, notices, tips and achievements.                              | `sim/`; never `ui/`                                                                |
| `scene/` | React Three Fiber components: the world, walkers, cars, lights, and the runtime maps below.                                           | `sim/`, `state/`, `input/`, `audio/`                                               |
| `ui/`    | The DOM HUD: top bar, panels, menus, the title screen.                                                                                | `sim/`, `state/`, `input/`, and `scene/runtime` (what's clickable, the view's yaw) |
| `audio/` | Web Audio: the engine, buses, samples, music, rain and voices. Reacts to the store through `subscribeTo`.                             | `sim/`, `state/`, and `scene/runtime` (for distance and pan)                       |
| `input/` | Pointer, touch and gesture rules and media queries.                                                                                   | Only its own files (and React and R3F)                                             |

oxlint enforces the first two rows (`.oxlintrc.json`): `sim/` imports nothing but `sim/` (no React, three.js or store), and `state/` never imports `ui/`. `sim/` is never called with the store; the store calls `sim/`.

## The store

One zustand store (`state/store.ts`), composed from slices in `state/slices/` (`ui`, `clock`, `economy`, `customers`, `staff`, `service`, `clients`, `world`, `career`, `day`). `GameState` and its types are in `state/types.ts`, pure reads in `state/derived.ts`, memoised reads in `state/selectors.ts`.

- **Discrete events only.** The store holds what changes a few times a second at most: a customer's phase, a sale, the clock's minute. Per-frame values (positions, the camera, animation) never go through it.
- **One `set()` per clock step.** `tickClock`, `startNextDay` and `loadGame` run inside `k.batch`, so each is stored with a single `set()`, and every listener and selector runs once per step. New work inside them stays in the batch.
- **Listeners** go through `subscribeTo(select, onChange, equal?)` or `subscribeDiff` (`state/subscribe.ts`), never `useGame.subscribe`. `select` runs on every set and must allocate nothing.
- **Components select only what they draw.** A panel selects whether it's open and mounts a body that selects the rest.
- **The rngs** are seeded by the day (`state/rng.ts`), so a day plays the same each time it's rebuilt from its number.

## The runtime maps

Per-frame state lives outside the store, in module-level maps in `scene/runtime.ts`, written by the frame loops and read by whoever needs them:

- `playerPos`, `customerPos`, `staffPos`, `ambientPos` (passers-by, the owner, Nazma) and `vehiclePos`: where everyone and every moving car is;
- `customersAtCar`, `atCounter`, `serviceCarsHome`, `lifts`, `walkInSpawns`: hand-offs between the scene's loops and the store's actions;
- `layout`, `grid`, `interactables`, `reservations`: the map as today's expansions and improvements have it, rebuilt in place each morning;
- `cameraState` and `gameTime`: the camera's focus and yaw, and the running game time between store steps.

A frame loop that must tell the store something goes through `report(who, key, send)` (`scene/walker.ts`), so a call that changed nothing isn't repeated every frame. The crowd is gathered once a frame (`nextFrame`, `crowdAgents`, `SpatialHash` in `sim/crowd.ts`), and frame loops allocate nothing per frame.

## Rendering

- The canvas draws every frame while the game is played and only on demand while nothing moves (`sceneIdle`: the title screen, the guide, the rotate prompt, the day summary).
- Graphics quality is three tiers of pixel ratio, shadow map and rain (`sim/graphics.ts`). `scene/Quality.tsx` steps between them on Auto from drei's `PerformanceMonitor`; High and Low hold one. The setting is a device preference in localStorage.
- Models are compressed (`scripts/compress-models.mjs`, from `assets-src/models` into `public/models`): meshopt and quantized, each car joined into one mesh. Only day one's models preload; the rest load in their own Suspense on first use.
- Floors, parking stripes and road dashes are merged into one mesh per colour (`scene/mergePlanes.ts`); the sign's bulbs are one instanced mesh; cars share one material per model, dirt step and wear step; small props don't cast shadows; passers-by reuse pooled character rigs (`scene/characterPool.ts`).

## Saving

One localStorage slot (`state/persistence.ts`), written at the end of each day; `sim/save.ts` owns the format, with an `UPGRADES` step for each older version. Each day is rebuilt from its number, so nothing mid-day is saved. Device preferences (sound, graphics, the controls hint) and the trophy case are kept apart from the save. If the browser refuses the write (a full quota or blocked storage), the game says so in a notice and plays on.

At day 500 with a full client book and day log, the save is about 160 KB and `createSave`/`parseSave` take about a millisecond (`docs/PERF.md`), well inside localStorage's 5 MB.

## Why there's no server

Decided with Robert on 2026-10-08, for Phase 18: the game stays client-only with one local save.

- Nothing built needs one. Every feature through Phase 17 runs in the browser, and leaderboards, sharing and online reviews were each left out when their phase was planned.
- The save is small and grows slowly: a few KB at the start, about 50 KB for a full client book, about 15 KB a year of day log.
- A server would bring hosting, accounts, privacy and an always-online dependency for a single-player game.

Any of these would reopen it:

- **Cloud saves across devices**: playing one game on the phone and the desktop.
- **Online leaderboards or sharing**: comparing runs with other players.
- **Accounts** for any reason.
- **A save that outgrows localStorage**: past a few MB, or a browser that clears it too often to trust.

The step before any server would be **exporting and importing the save as a file**: it moves a game between devices by hand, needs nothing hosted, and reuses `createSave`/`parseSave` as they are.
