# Phase 2 Plan — Characters, Customers & MSRP Sales

**Status:** Planned 2026-10-04, approved for implementation in a new session. First step: copy this plan to `docs/PHASE2_PLAN.md` and start 2a. One sub-phase per session, stop for review after each.

## Context

Phase 1 (1a–1d) delivered a walkable dealership: grid + A*, iso camera, walls with cutaway, Kenney props, and a single-slot action system (`instant` / `timed` / `hold`) driven from `Player.tsx`. The spec's Phase 2 asks for (1) better-looking characters than the capsule-with-a-nose, and (2) customers who can buy a car at MSRP or refuse — no negotiation yet. This gives the game its first real loop: customers arrive, you help them, you earn revenue.

**Decisions made with Robert:**

- Characters: **Kenney CC0 character GLBs** (Mini Characters pack) with built-in idle/walk/sit clips, matching the existing Kenney art.
- Sale flow: Greet customer → they name the car they want → **Offer at MSRP** → if accepted, customer **follows player to the office desk** → timed **Sign paperwork** → money in, car gone.
- Time: **day clock** (business hours compressed into a few real minutes), customers arrive during the day, **end-of-day summary**.
- Inventory: a sold car **leaves the lot and its space stays empty** (Phase 4 adds restocking). Add a dev-only restock cheat.
- Same process as Phase 1: write `docs/PHASE2_PLAN.md` first, implement **one sub-phase per session**, stop for review after each.

## Architecture additions

```
src/sim/
  rng.ts            # seeded PRNG (mulberry32) so customer gen + decisions are testable
  clock.ts          # game time: day, minute, open/closing, speed; pure advance(dtMs)
  inventory.ts      # InventoryCar {id, model, spaceIndex|display, msrp, status}; MSRP table per model
  agent.ts          # path-following step extracted from Player (waypoints + moveWithCollision)
  customers.ts      # Customer type, generator, state machine reducer, decide(customer, car)
  spawner.ts        # arrival schedule for a day (count + times from rng)
src/scene/
  Character.tsx     # GLB character: SkeletonUtils clone, useAnimations, anim = idle|walk|sit
  Customers.tsx     # renders/updates all customers in one useFrame
  CustomerBubble.tsx# "!" / "?" / "$" / "😠" icon above head (drei Billboard)
  GameClock.tsx     # single useFrame ticker; pushes to store only on 10-min boundaries
src/ui/
  TopBar.tsx        # Day N · 10:40 AM · $ cash
  DaySummary.tsx    # end-of-day modal: visitors, sales, revenue, walked-out
public/models/characters/  # Kenney Mini Characters GLBs (+ LICENSE.md entry)
```

Rules carried over: per-frame positions in `runtime.ts` maps/refs (`customerPos: Map<id, Vec2>`), store holds discrete events only (customer phase changes, clock ticks at 10-game-minute granularity, money, sales log).

## Sub-phases

### 2a — Character models

- Add Kenney **Mini Characters** GLBs to `public/models/characters/` (pick ~6 variants: 1 for the salesperson, rest for customers). Inspect the clip names on download (expect idle / walk / sit) and record them in the plan notes.
- `scene/Character.tsx`: `useGLTF` + `SkeletonUtils.clone` (skinned meshes can't use the plain `scene.clone` from `Props.tsx`'s `useCenteredModel`), `useAnimations`, crossfade between clips driven by an `anim` ref (not props/state — read in `useFrame`). Scale so height ≈ 1.2 units; shadows on.
- `Player.tsx`: replace capsule + nose with `<Character variant="salesperson">`; walk clip while moving, idle when stopped, sit clip instead of the current `SEATED_SCALE` squash (keep `SEAT_HEIGHT` offset if needed).
- Hover outline code in `Interactable.tsx` must cope with skinned meshes later (customers) — verify `<Outlines>` works on SkinnedMesh; fallback is a ground ring highlight.
- **Done when:** player is an animated low-poly person, walks/idles/sits correctly from all 4 camera angles; tests/lint/build clean.

**2a notes (implemented):**

- Pack: Kenney Mini Characters (CC0), downloaded 2026-10-04. Copied `character-male-d` (suit, the salesperson) and customers `male-a`, `male-b`, `female-b`, `female-c`, `female-d`, `female-f` plus the shared `Textures/colormap.png`. Skipped `female-a` (crutches), `female-e` (doctor), `male-c` (police).
- Each GLB has two skinned meshes (`body-mesh`, `head-mesh`), bones `root, leg-left, leg-right, torso, arm-left, arm-right, head`, origin at the feet, facing +z, ~0.67 units tall (scaled 1.8×).
- Clips: `static, idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-*, attack-*, interact-right/left, wheelchair-*`. `emote-yes` / `emote-no` will suit accept / refuse in 2e.
- Variant ids live in pure `sim/characters.ts` (`CUSTOMER_VARIANTS`) so the 2c generator can pick one without scene imports.
- Locomotion: at 1.8× the walk loop covers ~1.1 units (≈1.65 u/s) and sprint ~1.28 (≈2.6 u/s). The player moves at 5 u/s, so it plays **sprint** time-scaled to match (`Character moveSpeed`). Customers should use `walk` at their own speed.
- `<Outlines>` works on SkinnedMesh (drei binds the outline to the parent's skeleton) and follows the animated pose, and hover raycasts hit fine, so no ground-ring fallback needed.
- In idle, one arm looks horizontal from the iso camera. That's projection: both arms are lowered 45°, matching Kenney's own preview.

### 2b — Clock, money & inventory model

- `sim/clock.ts`: `GameTime {day, minute}`, `OPEN = 9:00`, `CLOSE = 18:00`, ~6 real minutes per day (configurable), `advance(t, dtMs)`, `formatTime`. Tests.
- `scene/GameClock.tsx`: one `useFrame` accumulates real time; calls `store.tickClock()` only when the 10-minute bucket changes. Pause while the day summary is open.
- `sim/inventory.ts`: build initial inventory from `LOT_CARS` + showroom display cars; MSRP per model (e.g. hatchback $24k … truck $52k, luxury SUV $68k) with small per-car variation from the seeded rng. Tests.
- Refactor so lot cars render from **inventory** instead of a static prop list: `layout.ts` keeps parking spaces and fixed props; `Props.tsx` renders `available` cars. Removing a car must unblock its footprint — add `Grid.setBlocked(rect, bool)` and rebuild that car's interactable entry (remove from `interactables` map).
- Store: `cash`, `inventory` (discrete: changes only on sale), `sellCar(id)`, `devRestock()` (bound to a dev key, e.g. `R` behind `import.meta.env.DEV`).
- UI: `TopBar` (day, time, cash); car `InfoPanel` shows MSRP and status.
- **Done when:** clock runs, top bar updates, Inspect shows MSRP, `sellCar` from the console removes the car and its tiles become walkable.

**2b notes (implemented):**

- `sim/rng.ts` (mulberry32) landed here rather than in 2c, since MSRP variation needs it. 2c reuses it.
- Clock: 9:00–18:00 in 6 real minutes (`DEFAULT_DAY_MS`, so 1.5 game minutes per real second). `advance` stops at closing and never rolls the day over; starting the next day is the day summary's job (2e). Because the clock is already stopped at closing, the summary needs no separate pause flag.
- The precise running time lives in `runtime.gameTime`; the store's `clock` is snapped to 10-minute steps. `GameClock` resyncs `gameTime` when the store's day changes, so 2e only has to set `clock: startOfDay(n + 1)`. Its frame delta is clamped to 0.25s (not 0.05s like movement) so a low frame rate doesn't slow the day.
- Showroom cars moved from the fixed props to `DISPLAY_CARS` in `layout.ts`; `PROPS` / `createGrid` now cover fixed props only. `buildInventory(rng)` keeps the old ids (`display-N`, `lot-car-N`).
- Base MSRPs: hatchback $24k, sedan $28k, van $36k, SUV $39k, sports sedan $44k, truck $52k, luxury SUV $68k, each car ±5% rounded to $100. The store seed is fixed (`INVENTORY_SEED`), so prices are the same every load.
- `runtime.ts` subscribes to the store: when `inventory` changes it re-applies car footprints to the grid (`applyToGrid`, using the new `Grid.setRectBlocked`) and rebuilds **all** interactables, since a freed footprint can add approach tiles to its neighbours. The subscription runs inside the store update, before React re-renders.
- `sellCar(id, price = msrp)` credits cash and drops the menu / hover / inspect panel / action aimed at that car. It takes a price so Phase 5 negotiation can reuse it.
- Dev: `R` restocks sold cars, skipping any space the player is standing in (otherwise they'd be stuck inside the footprint). `window.game` is the store in dev builds, e.g. `game.getState().sellCar('lot-car-1')`.
- Starting cash is $25,000 (`STARTING_CASH`).

### 2c — Customer simulation (pure TS)

- `sim/rng.ts`, `sim/customers.ts`, `sim/spawner.ts` — no React/three, fully unit-tested.
- `Customer`: id, name, character variant, `budget`, `preferredModels` (body-type taste), `patience` (game minutes), `targetCarId`, `phase`, `mood`.
- Phases (reducer like `sim/actions.ts`, events carry ids so stale ones are ignored):
  `arriving → browsing (walk to 1–3 cars, linger) → waiting (wants help, patience ticking) → talking → considering → following → signing → leaving(bought|refused|impatient|closing)`.
- `decide(customer, car, rng)`: refuse if MSRP > budget; otherwise accept with probability scaled by preference match and how far under budget. Deterministic given seed. Tests for each branch.
- Spawner: per-day arrival times (e.g. 6–10 visitors, weighted to midday), none after ~17:00; at close, all non-signing customers head out.
- **Done when:** Vitest covers state transitions, decisions, spawn schedule, stale-event handling.

**2c notes (implemented):**

- `sim/customers.ts`: `reduceCustomer(c, ev)` per customer, `reduceCustomers(list, ev)` for the store (returns the same array when nothing changed). Events carry the customer id; anything that doesn't fit the current phase is ignored, which is how stale world/player events are dropped. `tick {minutes}` and `close` apply to everyone. `despawn` removes a `leaving` customer.
- Extra phase edges beyond the plan's list: a customer can be greeted while still browsing; `cancel` from talking, considering, following or signing returns them to `waiting` with the offer cleared and patience where it was; `greet` with `carId: null` (nothing left for sale) sends them off as `refused`. `close` spares only `signing`.
- Patience is `patience` (total) + `patienceLeft`, game minutes, 45–120 in steps of 5, and only drops in `waiting`. At 1.5 game min per real second that's 30–80 real seconds.
- `mood` is derived (`moodOf`), not stored: `impatient` once a waiting customer is under a third of their patience, `happy` while following/signing/bought, `unhappy` after refused/impatient, `neutral` otherwise (including closing). 2d's bubbles can read it directly.
- Generator (`generateCustomer(id, availableCars, rng)`): 1–2 preferred body types, budget = priciest preferred base MSRP × 0.85–1.3 rounded to $500, and 1–3 cars to browse (preferred types 4× likelier). Browse order ends at their favourite, which becomes `targetCarId`, so a waiting customer stands by the car they want. `chooseTarget` re-picks on greet if that car has sold. With the 2b stock, ~75% target a preferred type and ~30% can't afford their target.
- `decide` uses `acceptChance`: 0 over budget, else 35% + 35% if preferred + up to 30% for headroom (full at 25% under budget), capped at 95%. The reducer takes the answer (`respond {accepted}`) rather than calling `decide` itself, so the store owns the rng.
- `sim/spawner.ts`: `planArrivals(rng)` gives 6–10 arrival minutes, each the mean of two uniforms over 9:00–17:00 (triangular, peaks ~13:00). `takeDue(schedule, minute)` releases arrivals once each and catches up after a long frame.
- Ids, rng seeding per day and linger durations are left to the store/world in 2d.

### 2d — Customers in the world

- Extract path-following from `Player.tsx` into `sim/agent.ts` (`stepAlongPath(grid, pos, waypoints, speed, dt)`) and reuse it for player and customers; Player behaviour must not change.
- `runtime.ts`: `customerPos` / heading maps. `scene/Customers.tsx`: one `useFrame` loop that spawns customers at the sidewalk, paths them through the driveway gate, walks them between browsing targets (approach tiles of their chosen cars), handles leaving and despawn. Phase changes go to the store; positions never do.
- Customers use `<Character>` variants; `CustomerBubble` shows state (`!` waiting, `…` considering, `$` bought, frown on refusal/impatience).
- Customers don't collide with each other or the player for now (note it as a known limitation).
- **Done when:** over a day, customers visibly arrive, browse cars, wait with a `!`, give up after their patience runs out and leave by closing time.

### 2e — Selling & the day loop

- Customers become interactables: generalise `Interactable` targets so the approach for a customer is computed from their **current** tile (1×1 rect via `approachTilesFor`) and the customer freezes (`engaged`) once the player is heading to them. Menu actions depend on customer phase (`actionsFor(customer)`).
- New actions in `sim/interactables.ts` `ACTIONS`:
  - **Greet** (timed ~1.5s): customer reveals the car they're interested in and a budget hint in a small dialog panel.
  - **Offer at MSRP ($X)** (instant): runs `decide`. Refuse → notice + customer leaves unhappy. Accept → customer phase `following`.
  - **Close deal** (on the office desk/chair, only enabled while a customer is following): player sits at the desk, customer walks to the guest chair/seat opposite (add a guest chair prop to `layout.ts` if none fits), timed **Sign paperwork** (~4s) → `cash += msrp`, `sellCar`, sales log entry, customer leaves happy.
  - Cancelling while a customer is following makes them wait (patience resumes), not vanish.
- Day loop: at 18:00 remaining customers leave; when the lot is empty of customers show `DaySummary` (visitors, sales, revenue, walk-outs, cash); "Start Day N+1" resets clock and spawner.
- HUD: active customer dialog panel; controls hint updated.
- **Done when:** full loop works — greet, offer, refuse/accept, walk to office, sign, revenue added, car removed, summary at day end; Esc/move cancels cleanly at every step and nobody gets stuck.

## Files touched (representative)

- New: `src/sim/{rng,clock,inventory,agent,customers,spawner}.ts` + tests, `src/scene/{Character,Customers,CustomerBubble,GameClock}.tsx`, `src/ui/{TopBar,DaySummary,CustomerPanel}.tsx`, `docs/PHASE2_PLAN.md`
- Modified: `src/scene/Player.tsx`, `src/scene/Props.tsx`, `src/scene/runtime.ts`, `src/scene/Interactable.tsx`, `src/sim/{grid,layout,interactables,actions}.ts`, `src/state/store.ts`, `src/ui/{HUD,InfoPanel,ControlsHint}.tsx`, `public/models/LICENSE.md`, `CLAUDE.md` (phase pointer)
- Reuse: `findPathToAny`, `approachTilesFor`, `interactableCenter`, `reduceAction`, `moveWithCollision`, `hasLineOfSight`, `smoothPath`, notice toast, CSS progress bar.

## Verification (each sub-phase)

- `npm test` (new sim suites + existing), `npm run lint`, `npm run build` all clean.
- Manual play in `npm run dev` against the sub-phase's "Done when"; screenshots via the cached Playwright headless shell (`--use-angle=swiftshader`), driving the store through the Vite-served module URL as in Phase 1 notes. For 2d/2e, add a dev-only clock speed-up so a full day can be checked quickly.
- Robert reviews and approves each sub-phase before the next starts.

## Out of scope

Negotiation (Phase 5), other employees/NPCs (Phase 3), buying inventory (Phase 4; dev restock only), marketing (Phase 6), save/load, audio, agent-agent collision avoidance.
