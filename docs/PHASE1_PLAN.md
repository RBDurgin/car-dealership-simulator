# Phase 1 Plan — Walkable Dealership (Car Dealership Simulator)

**Status:** 1a done (commit `3fd163d`). 1b implemented, pending review. Next up: 1c. Implement one sub-phase per session, stop for review after each.

## Context

The repo is empty apart from `CLAUDE.md` and `docs/SPEC.md`. Phase 1 in the spec calls for basic game mechanics and a dealership lot plus office the player can walk around, Sims-style, with point-and-click as the main control and WASD as a backup. Phase 2 adds customers, so Phase 1 has to leave clean extension points: a grid world, an interaction system and shared state.

**Decisions made with Robert:**

- Stack: Vite + TypeScript + React Three Fiber + drei + zustand. The sim logic stays in pure TS with no React or three.js.
- Visuals: isometric orthographic camera with low-poly style. Primitives come first, then CC0 Kenney assets (Car Kit, Furniture Kit).
- Mechanics: movement plus **clickable interactables**, with no game clock, inventory model or saving yet.
- Tooling: Vitest, oxlint (the Vite template default, used instead of ESLint) and Prettier.
- Phase 1 is split into sub-phases **1a–1d**, each ending with something playable to review.

## Architecture

```
src/
  main.tsx, App.tsx            # Canvas + DOM HUD overlay
  sim/                         # PURE TS — unit tested, no React/three imports
    grid.ts                    # Grid class: size, walkable[], tile<->world helpers
    pathfinding.ts             # A* (8-dir, no corner-cutting), path smoothing
    layout.ts                  # Dealership layout data: zones, walls, doors, props → builds Grid
    interactables.ts           # Interactable defs: id, kind, tile, approachTiles, actions[]
  state/store.ts               # zustand: player target/path, hovered/selected id, pending action, wallMode
  scene/
    CameraRig.tsx              # Ortho iso camera; follow player, Q/E rotate 90° (eased), wheel zoom
    Ground.tsx                 # Ground plane; raycast click → tile → path request
    Building.tsx               # Walls/floors from layout; cutaway logic
    Lot.tsx, Office.tsx        # Props (cars, desk, chair, plants…)
    Player.tsx                 # Follows path in useFrame (mutates refs, not store), faces direction
    Interactable.tsx           # Wrapper: hover Outlines + cursor, click → action menu
    ClickMarker.tsx, DebugGrid.tsx
  input/useWasd.ts             # Camera-relative WASD, per-axis grid collision, cancels path
  ui/HUD.tsx, ActionMenu.tsx, InfoPanel.tsx, ControlsHint.tsx
public/models/                 # Kenney GLBs + LICENSE note
```

Rules to keep it clean:

- Per-frame values like player position and lerps live in refs or `useFrame`. Never `setState` every frame.
- The store holds only discrete events: path changed, hovered, selected, action started or finished.
- The layout is data, and the grid is built from it, so Phase 2 can spawn customers that reuse the same grid and A*.

## Implementation notes from 1a

- Dev runs in a dev container: `vite.config.ts` sets `server: { host: true, port: 5173, strictPort: true }` so VS Code forwards the port. Open `http://localhost:5173` on the host.
- drei's `OrthographicCamera` needs an explicit `lookAt` (set in `CameraRig.tsx` via `onUpdate`). When the camera moves in 1b, keep re-aiming it each frame.
- Use `<Canvas shadows="percentage">`; the default soft shadow type is removed in the installed three.js.
- The `THREE.Clock deprecated` console warning comes from R3F internals and is harmless.
- One world unit = one grid tile. The ground is 40×30 units, centered on the origin.
- Headless Chromium is not installed in the container, so verify visuals manually in the browser.

## Sub-phases

### 1a — Scaffold & first scene (DONE)

- `git init`, Vite `react-ts` template, then add `three @react-three/fiber @react-three/drei zustand`, plus dev dependencies `vitest eslint prettier @types/three`.
- npm scripts: `dev`, `build`, `test`, `lint`, `format`.
- A Canvas with an orthographic iso camera (~35° pitch, 45° yaw), hemisphere and directional light with soft shadows, a ground plane and a placeholder box.
- Update `CLAUDE.md` with the stack, folder conventions and commands.
- **Done when:** `npm run dev` shows the lit iso scene, and `npm test` and `npm run lint` pass.

### 1b — Movement & camera (IMPLEMENTED, pending review)

- Add `Grid` and A* in `sim/` with Vitest tests covering a straight path, a path around obstacles, an unreachable target, no corner cutting and path smoothing.
- Player capsule: clicking the ground raycasts to a tile, A* runs, a click marker appears and the player walks the path at constant speed and rotates to face where it's going.
- WASD moves relative to the camera with per-axis collision against the grid, so the player slides along walls. Any key press cancels the current click path.
- CameraRig: smooth follow, Q/E rotates in 90° steps with easing (WASD stays camera-relative), and the mouse wheel zooms within limits.
- Debug grid overlay toggled with `G`, showing walkable and blocked tiles.
- **Done when:** the player can click or WASD around an obstacle field and never clips into blocked tiles.

### 1c — Dealership environment

- `layout.ts` sets out about 40×30 tiles. An outdoor **lot** has striped parking spaces, a sidewalk, a perimeter fence and a sign. A **showroom** has glass walls and 2–3 display cars. The **office** is a private room with a doorway into the showroom. A small reception area is optional.
- Walls sit on blocked tiles and are rendered as thin wall meshes, with doorways as gaps. The layout is the source of truth for the grid.
- Sims-style wall modes, cycled with `V`: **Up / Cutaway / Down**. In Cutaway, walls on the camera-facing side drop to knee height and the choice updates on each camera rotation.
- Placeholders are swapped for Kenney CC0 models (cars, desk, chair, plants) loaded with `useGLTF` and preloaded. The props register their footprints as blocked tiles.
- **Done when:** the player can walk lot → showroom → office through the doors but not through walls, and cutaway keeps the player visible from all 4 camera angles.

### 1d — Interactables & HUD

- `Interactable` wrapper: hovering shows an outline and a pointer cursor, and clicking opens a small **action menu** (Sims pie-menu style, done as a DOM menu at the cursor).
- Choosing an action sets the pending action, paths the player to the nearest reachable approach tile, faces the object and then runs the action.
- First interactables:
  - **Car → "Inspect"** opens an info panel with a placeholder name and color.
  - **Desk chair → "Sit"** snaps the player to a sit pose, and any move order makes them stand up first.
  - **Coffee machine → "Get coffee"** shows a short timed action with a progress indicator. This exercises the timed-action path that Phase 2 will need.
- HUD: a controls hint (click, WASD, Q/E, wheel, V, G), the current action label and Esc to cancel.
- Unit tests for picking the approach tile and the action-queue state transitions.
- **Done when:** all three interactions work from any starting point, cancel cleanly and the player can't get stuck.

## Verification (each sub-phase)

- `npm test` runs the Vitest suites for `sim/` and the store transitions.
- `npm run lint` and `npm run build` are clean, with no TS errors.
- Manual play-through in `npm run dev`, driven with the `run` skill or a browser for screenshots, against each sub-phase's "Done when" checklist.
- Robert reviews and approves each sub-phase before the next starts.

## Out of scope (later phases)

Customers and NPCs, sales, game clock and days, inventory and MSRP data, save/load, audio, mobile/touch controls.
