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
- Phase 3 plan: `docs/PHASE3_PLAN.md`, split into 3a (staff foundation, hiring, receptionist), 3b (light avoidance), 3c (handlers and finance manager), 3d (AI salesperson), 3e (lot porter and cleanliness), 3f (pedestrians, archetypes, owner). Customers and staff share the walker core in `scene/walker.ts`; staff positions live in `runtime.staffPos`.
- Save game: one localStorage slot, autosaved only at end of day (`state/persistence.ts`) and resumed from the title screen on the next morning. `sim/save.ts` owns the format (day, cash, inventory, roster); each day is rebuilt from its number, so nothing mid-day is saved. Bump `SAVE_VERSION` when a saved type (`InventoryCar`, `Employee`) changes shape.

### Commands

- `npm run dev` starts the dev server
- `npm test` runs Vitest once (`npm run test:watch` to watch)
- `npm run lint` runs oxlint
- `npm run format` runs Prettier
- `npm run build` type-checks and builds
