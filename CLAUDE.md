### Overview

This is a web-based rpg-style game that simulates day to day tasks of a fictitional car dealership. Overall goal of the game is to establish a rich client base, and increase revenue.

### Architecture

We can try using three.js, I'm open to alternatives if you think there's a reason to evaluate alternatives.

**Decided stack (Phase 1):** Vite + TypeScript + React Three Fiber (`@react-three/fiber`, `@react-three/drei`) + zustand. Isometric orthographic camera, low-poly style.

### Conventions

- `src/sim/` is pure TypeScript (no React or three.js imports) and unit tested with Vitest. Grid, pathfinding, layout and interactable definitions live here.
- `src/scene/` holds R3F components, `src/ui/` holds DOM HUD, `src/state/` holds the zustand store, `src/input/` holds input hooks.
- Per-frame values (player position, camera easing) live in refs or `useFrame`. Never call `setState` every frame. The store only holds discrete events.
- Phase plan: see `docs/SPEC.md` and the detailed `docs/PHASE1_PLAN.md`. Phase 1 is split into 1a (scaffold), 1b (movement and camera), 1c (environment), 1d (interactables and HUD).
- Phase 2 plan: `docs/PHASE2_PLAN.md`, split into 2a (character models), 2b (clock, money, inventory), 2c (customer sim), 2d (customers in the world), 2e (selling and day loop). Character GLBs are skinned: clone with `SkeletonUtils.clone`, drive clips through an `anim` ref (`scene/Character.tsx`).
- Phase 3 plan: `docs/PHASE3_PLAN.md`, split into 3a (staff foundation, hiring, receptionist), 3b (light avoidance), 3c (handlers and finance manager), 3d (AI salesperson), 3e (lot porter and cleanliness), 3f (pedestrians, archetypes, owner). Customers and staff share the walker core in `scene/walker.ts`; staff positions live in `runtime.staffPos`. Walkers avoid each other through `sim/crowd.ts` (goal-tile reservations, separation push, stuck guard); the player is never pushed. Deals are per handler: `Customer.handlerId` is `PLAYER_ID` or an employee id, so use `dealCustomer(customers, handlerId)` and never assume a single deal. Buyers handed off to finance wait in the `queued` phase until `callNextBuyer` frees the guest chair for them. A salesperson `claim`s a customer (sets `handlerId`, phase unchanged) before walking over; `sellerId` keeps who made the sale through a hand-off, and `chairId` is the guest chair a buyer walks to and signs in (office or a sales desk). Salesperson decisions are pure in `sim/staffAi.ts` (`nextSalesTask`); `scene/Staff.tsx` carries them out through the store's `staff*` actions. Car dirt lives on `InventoryCar.cleanliness` (`sim/cleanliness.ts`): dust overnight in `beginDay`, a little per browse visit in `commit`, washed back to 1 by the porter (`nextPorterTask`, `staffWash`) or the player's **Wash car**; it feeds `acceptChance` (±8%) and the car's paint tint in `scene/Props.tsx`. Customers have an `archetype` (`sim/archetypes.ts`) that shapes their traits in `generateCustomer` and adds to `acceptChance`; a couple's `companion` is a look only, walked by `scene/Customers`. Passers-by (`sim/pedestrians.ts`, `scene/Pedestrians.tsx`) and the owner's walk (`scene/Owner.tsx`) live outside the store: positions go in `runtime.ambientPos`, a walk-in becomes a customer through the store's `walkIn`, and the owner's goal (`sim/owner.ts`) is `owner` in the store, judged in `settleDay`.
- Phase 4 plan: `docs/PHASE4_PLAN.md`, split into 4a (touch input foundation), 4b (mobile HUD and on-screen controls), 4c (mobile performance and device QA). Mouse acts on `pointerdown` as before; touch and pen act on `pointerup` only when `isTap` (`input/touch.ts`, pure rules in `input/gestures.ts`), so a pinch never moves the player or opens a menu, and touch never sets the hover outline. Anything that swallows clicks must swallow `onPointerUp` too. Camera yaw changes go through `rotateView(dir)` in `scene/runtime.ts`. Layout breakpoints are `COMPACT`/`COARSE` in `input/useMediaQuery.ts` (mirrored in `ui/hud.css`); hints that name a key show the touch wording on `COARSE`, and every keyed action also has an on-screen button (`ui/ViewControls.tsx`, the status ✕, the Staff button). Position HUD panels with the `--edge-*` variables so they clear the notch. `rotatePrompt` (portrait on touch) pauses the game through `isPaused`.
- Keep the in-game help in sync: when a feature changes what the player can do (a new action, key, role, or rule like commissions), update the how-to-play guide (`ui/HowToPlay.tsx`) and the controls list (`ui/controls.ts`) in the same change. Describe only what's built, not what's planned.
- Save game: one localStorage slot, autosaved only at end of day (`state/persistence.ts`) and resumed from the title screen on the next morning. `sim/save.ts` owns the format (day, cash, inventory, roster); each day is rebuilt from its number, so nothing mid-day is saved. Bump `SAVE_VERSION` when a saved type (`InventoryCar`, `Employee`) changes shape.

### Commands

- `npm run dev` starts the dev server
- `npm test` runs Vitest once (`npm run test:watch` to watch)
- `npm run lint` runs oxlint
- `npm run format` runs Prettier
- `npm run build` type-checks and builds
