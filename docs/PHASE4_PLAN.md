# Phase 4 Plan — Mobile breakpoint & touch controls

**Status:** Planned 2026-10-05, approved for implementation in a new session. First step: add a Phase 4 line to `CLAUDE.md` conventions, then start 4a. As in earlier phases, we do one sub-phase per session and stop for Robert's review after each.

## Context

The game is built for mouse and keyboard. Clicks fire on `pointerdown` (`scene/Ground.tsx`, `scene/Interactable.tsx`). Zoom is wheel-only and rotation is Q/E-only (`scene/CameraRig.tsx`). Cancel, help, wall mode and staff all have keyboard shortcuts, and only Staff also has a button. The HUD (`ui/hud.css`) uses fixed desktop sizes: the top bar, controls hint, info, customer and status panels overlap on a phone, and the controls hint is always visible. On a phone the browser also pinch-zooms the whole page.

The spec's Phase 4 asks for a mobile breakpoint and controls: the controls HUD should be hidable, and pinch-zoom should work.

**Decisions made with Robert:**

- **Movement:** tap-to-move only, with no virtual joystick. Tapping already pathfinds.
- **Camera:** pinch to zoom, plus on-screen ⟲ ⟳ rotate buttons that do what Q/E do. No twist gesture and no drag-pan.
- **Controls HUD:** collapsible on every device. It starts collapsed on small or touch screens, and the choice is remembered per device.
- **Orientation:** landscape only. In portrait on a touch device, a "rotate your device" overlay pauses the game.

## Architecture additions

```
src/input/
  gestures.ts        # pure: tap-vs-drag classification, pinch distance → zoom factor (Vitest)
  touch.ts           # tracks active touch pointers on the canvas; isTap(pointerId), pointerCount
  useMediaQuery.ts   # small matchMedia hook (coarse pointer, compact screen, portrait)
src/ui/
  ViewControls.tsx   # ⟲ ⟳ rotate, wall mode, help (?) buttons
  RotatePrompt.tsx   # portrait overlay on touch devices
```

- `gestures.ts` is pure TS with no DOM, React or three.js. It is tested like `sim/`; Vitest already picks up `src/**/*.test.ts`.
- Mouse behaviour doesn't change. Touch pointers act on **tap** (pointerup with little movement and no second finger) instead of pointerdown, so starting a pinch never issues a move order or opens a menu.
- Camera yaw becomes callable from the UI: move `yawTarget` into `cameraState` in `scene/runtime.ts` and export `rotateView(dir)`. Both the Q/E handler and `ViewControls` call it, and it still calls `setViewYaw`.
- Per-frame values stay in refs. Pinch updates `zoomTarget` the same way the wheel handler does. The only new store state is discrete: `controlsOpen`, and `rotatePrompt` (which `isPaused` respects).

## Sub-phases

### 4a — Touch input foundation

- `index.html`: viewport `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- `index.css`/Canvas: `touch-action: none` and `overscroll-behavior: none` on the canvas and HUD. Also `-webkit-touch-callout: none` and `-webkit-tap-highlight-color: transparent`, and prevent iOS `gesturestart` and long-press `contextmenu` on the canvas.
- `input/gestures.ts`:
  - `classifyTap(start, end, maxPointers)`: a tap moves under about 10px, takes under about 500ms and uses one pointer.
  - `pinchZoom(prevDist, dist)` returns a ratio.
  - Tests cover tap vs drag, two-finger cancel and clamping.
- `input/touch.ts`: pointer tracking on `gl.domElement` (down/move/up/cancel) for touch and pen pointers.
- `scene/Ground.tsx` and `scene/Interactable.tsx`:
  - A mouse keeps the current `onPointerDown` path.
  - Touch handles `onPointerUp` and acts only when `isTap`.
  - Touch skips the hover outline (`setHovered`) so it can't stick. The open menu's target still highlights through `menu.targetId`.
- `scene/CameraRig.tsx`:
  - When two touch pointers are down, pinch scales `zoomTarget` within `MIN_ZOOM`/`MAX_ZOOM`.
  - Q/E move to `rotateView` in `runtime.ts`.
- **Done when:** in Playwright with touch emulation (and on a real phone through the LAN dev server), tapping the ground walks the player there and tapping a car or customer opens the pie menu. Pinch zooms smoothly without moving the player, the page itself never zooms or scrolls, and desktop mouse/keyboard play is unchanged.

### 4b — Mobile HUD & on-screen controls

- **Breakpoint:** a "compact" layout under `@media (max-height: 500px), (max-width: 760px)`, which covers landscape phones. `pointer: coarse` turns on touch-only tweaks such as larger tap targets. Use `env(safe-area-inset-*)` for the notch.
- **Collapsible controls HUD** (`ui/ControlsHint.tsx`):
  - A header toggle button ("Controls ▾") shows or hides the list.
  - The store holds `controlsOpen`. It defaults from the compact/coarse media query and is persisted in a localStorage key (wrapped in try/catch, separate from the save slot).
- **Touch control list:** `ui/controls.ts` gains `TOUCH_CONTROLS`: Tap = move / interact, Pinch = zoom, ⟲ ⟳ = rotate, ✕ = cancel, Walls button, ? = help. `ControlsHint` and `HowToPlay` show the list that matches the device's pointer type. HowToPlay copy that says "Press H" becomes "Press H or tap Staff".
- **`ui/ViewControls.tsx`:** a small button cluster with rotate left, rotate right, wall mode (`cycleWallMode`) and help (`toggleHelp`). It shows on every device, which also gives desktop players buttons for these actions.
- **Cancel button:** `ActionStatus` in `ui/HUD.tsx` gains a ✕ that calls `cancelAll`. On touch, "Esc to cancel" becomes "Tap ✕ to cancel".
- **Compact layout fixes (`ui/hud.css`):**
  - Top bar: smaller font, separators hidden, the goal banner shortened to an icon plus progress.
  - Info panel and customer panel: narrower, with a `max-height` and scroll, and placed so they don't cover the status panel. The status panel moves up above the bottom panels.
  - Staff panel, day summary and how-to-play: `max-height: calc(100dvh - …)` and scroll. The day summary has no max-height today.
  - Pie menu: items are at least 44px tall, with `RADIUS`/`MARGIN` scaled for compact screens in `ActionMenu.tsx`.
- **`ui/RotatePrompt.tsx`:** shown when `(orientation: portrait) and (pointer: coarse)`. It sets the store's `rotatePrompt`, which `isPaused` includes, so the clock and walkers stop.
- **Done when:** at 667×375 and 932×430 (landscape iPhone sizes) every panel fits without overlapping and can be scrolled. Everything that has a key (rotate, cancel, help, walls, staff) can also be done by touch, the controls HUD collapses and stays collapsed after a reload, and portrait shows the prompt and pauses.

### 4c — Mobile performance & device QA

- Canvas `dpr={[1, 2]}`. On coarse/compact devices, lower the shadow map from 4096 to 2048 (`scene/Scene.tsx`).
- Check the drei `<Html>` bubbles and badges at small zoom on a phone screen. Scale them down on compact screens if they crowd.
- Play a full day on a real phone (Safari and Chrome) over the LAN dev server (`server.host` is already `true`): sell, hand off, hire, end the day, then reload and continue.
- Record what we learn under "Implementation notes" in `docs/PHASE4_PLAN.md`.
- **Done when:** a full day plays smoothly on a mid-range phone, and the frame rate after the shadow and DPR changes is noted in the plan.

## Files touched (main)

`index.html`, `src/index.css`, `src/App.tsx`, `src/scene/{CameraRig,Ground,Interactable,Scene,runtime}.tsx/ts`, `src/state/store.ts` (`controlsOpen`, `rotatePrompt`, `isPaused`), `src/ui/{HUD,ControlsHint,controls,HowToPlay,ActionMenu,hud.css}`, new `src/input/{gestures,touch,useMediaQuery}.ts`, new `src/ui/{ViewControls,RotatePrompt}.tsx`. No save-format change, so `SAVE_VERSION` stays as it is.

## Verification (each sub-phase)

- `npm test` (new `gestures.test.ts`, and a store test for `controlsOpen`/`rotatePrompt` pausing), plus clean `npm run lint` and `npm run build`.
- Playwright headless shell (see Phase 1 notes: SwiftShader, `executablePath`) with `hasTouch: true, isMobile: true` at a landscape phone viewport. Use `page.touchscreen.tap` for taps and dispatched two-pointer events for pinch. Take screenshots of each HUD state.
- Desktop regression pass: click-to-move, the pie menu, wheel zoom, Q/E and all keyboard shortcuts behave as before.
- Real-device check through the LAN dev server.
- Robert reviews and approves each sub-phase before the next starts.

## Out of scope

Virtual joystick, twist-to-rotate, drag-to-pan, portrait layout, PWA/fullscreen install, and haptics. Later phases (inventory buying, negotiation, marketing, audio) will build their UI on the compact breakpoint set up here.

## Implementation notes from 4a

- R3F attaches its pointer listeners to the canvas's parent div, so `input/touch.ts` listens on the canvas itself and runs first. That's why `isTap(pointerId)` already has its verdict inside an R3F `onPointerUp`.
- Touch never fires `onPointerOver` reliably, so `Interactable` now collects its meshes on a tap as well as on hover. Without that, the open menu's target couldn't be outlined.
- Click swallowers (walls, non-interactable props) stop `onPointerUp` as well as `onPointerDown`, or a tap on a wall would walk the player to the ground behind it.
- Cancelling `touchend` on the canvas stops the browser's follow-up `click`, which could otherwise land on a pie menu that just opened under the finger. `gesturestart` is cancelled on `document` because iOS Safari ignores `user-scalable=no`.
- Pinch goes through `onPinch(fn)` from the tracker; `CameraRig` applies it with the same clamp as the wheel.
- Playwright check (844×390, `hasTouch`, `isMobile`): taps were sent with `page.touchscreen.tap`, and pinches and drags with CDP `Input.dispatchTouchEvent`. A ground tap gave a move order, a car tap opened its menu with the car outlined, and pinching in and out zoomed with no move order or menu. A drag didn't move the player, and `visualViewport.scale` stayed 1. On desktop, click-to-move, hover then click for the menu, Q/E and wheel zoom work as before. To find a car's screen position, hover with the mouse and read `hoveredId`, then re-find it after the player walks, because the camera follows.
- The pie menu can open under the controls hint on a phone. The 4b compact layout fixes that.
