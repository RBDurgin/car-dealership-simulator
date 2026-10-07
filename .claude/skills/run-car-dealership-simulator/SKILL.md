---
name: run-car-dealership-simulator
description: Run, start, drive and screenshot the car dealership game (Vite + React Three Fiber) headless, and run its browser tests (npm run e2e). Use when asked to run the game, start the dev server, take a screenshot, run the e2e or Playwright tests, check a feature in the real app (cars, customers, staff, HUD), or confirm a change works beyond the unit tests.
context: fork
agent: general-purpose
model: sonnet
---

This skill runs as a Sonnet subagent: running and driving the game is
mechanical, and the screenshots are token-heavy. **Report back** what you
ran, what passed or failed (with the failing output), what each screenshot
shows and where it is, and anything odd. Don't change the game's code. If
something looks broken, say so and give the evidence: the main session
decides what to fix. Before calling something a bug, check the frame rate
(see Gotchas).

The game is a WebGL page served by Vite. An agent drives it with
`.claude/skills/run-car-dealership-simulator/driver.mjs`: a small
Playwright script that reads one command per line from stdin. It starts a
game, pokes the zustand store, presses keys and takes screenshots. All paths
are relative to the repo root. For a check that should keep passing, write
a test in `e2e/` instead (see Test).

## Prerequisites

Node 24 and npm, plus Playwright's Chromium in `~/.cache/ms-playwright`
(`chromium-1243` was already there). `@playwright/test` is pinned to
`1.63.0` in `package.json` to match that browser build. On a machine
without it, `npx playwright install chromium` fetches it.

## Setup

```bash
npm install
```

## Run (agent path)

1. Start the dev server in the background (use `run_in_background`, not `&`
   in a foreground call), then poll the port:

```bash
npm run dev -- --port 5199 --strictPort > /tmp/dealership-dev.log 2>&1
```

```bash
timeout 30 bash -c 'until curl -sf http://localhost:5199 >/dev/null; do sleep 1; done'
```

2. Drive it. Screenshots go to `$SHOTS` (default `/tmp/dealership-shots`).
   **Read the PNG**: a frame that's all sky or all title screen means the
   start step failed.

```bash
timeout 150 node .claude/skills/run-car-dealership-simulator/driver.mjs <<'EOF'
start Medium
eval for (let i = 0; i < 40 && !g().customers.some((c) => c.vehicle); i++) { const m = g().clock.minute + 10; useGame.setState({ arrivals: { minutes: [m, m], sources: ['regular', 'regular'], spawned: 0 } }); g().tickClock({ day: g().clock.day, minute: m }) } return g().customers.filter((c) => c.vehicle).map((c) => c.id)
key KeyT
wait 15000
eval return g().customers.filter((c) => c.vehicle).map((c) => [c.id, c.phase, c.vehicle.parked])
shot parked
errors
quit
EOF
```

That example forces arrivals until one drives in (Phase 12b), runs at 4×,
and checks that the car parked. Expected output:
`eval [["customer-8","browsing",true]]` and `errors []`.

Commands:

| Command                      | Does                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start [Easy\|Medium\|Hard]` | Opens the page, clicks **New game** and the level, then closes the how-to-play guide                                                                          |
| `wait <ms>`                  | Lets the game run, in real time                                                                                                                               |
| `shot <name>`                | Saves a screenshot to `$SHOTS/<name>.png`                                                                                                                     |
| `eval <js>`                  | Runs an async function body in the page with `useGame` (the store) and `g` (= `useGame.getState`) in scope, and prints what it returns as JSON. One line only |
| `click <text>`               | Clicks the first element with that text                                                                                                                       |
| `key <key>`                  | Presses a key, by Playwright name: `KeyT` (dev speed ×4/×16/×1), `KeyI` (stock panel), `Escape`, `Shift+KeyR`                                                 |
| `errors`                     | Prints page errors and console errors so far                                                                                                                  |
| `quit`                       | Closes the browser                                                                                                                                            |

Other modules can be reached from `eval` the same way, e.g.
`const rt = await import('/src/scene/runtime.ts'); return [...rt.vehiclePos.keys()]`
for scene-side state (positions live there, never in the store).

Stop the server when done. There's no `lsof` or `pkill`-safe pattern here,
so stop the background task (TaskStop), or kill the vite pid from
`ps aux | grep 'vite --port 5199'`.

## Run (human path)

`npm run dev` and open http://localhost:5173. Headless, it's no use without
the driver.

## Test

```bash
npm test && npm run lint && npm run build
```

Browser smoke tests are in `e2e/` (`playwright.config.ts`). They take about
2–3 minutes, so they aren't part of `npm test`. Playwright starts its own dev
server on 5199, or reuses one that's already running:

```bash
npm run e2e
```

`e2e/game.ts` has the helpers: `startGame(page, level)`, `inStore(page, fn, arg)`
(runs `fn` in the page with the store; `fn` is serialised, so pass values in
`arg`, never through a closure), `forceDriveIn` and `watchErrors`.

## Gotchas

- **The game runs at about a quarter speed headless.** SwiftShader renders
  about 1.5 fps, and `scene/walker.ts` caps each frame at 0.25 s of game time,
  so a car that takes 10 s in a browser takes about 40 s here. Press `key KeyT`
  once (×4) before a long `wait`. Don't press it three times: it cycles back to ×1.
- **WebGL needs `--use-gl=angle --use-angle=swiftshader`.** The driver
  passes these already.
- **A new game opens the guide**, which pauses the clock (`isPaused`).
  `start` closes it with **Let's go**. Without that step, nothing moves.
- **Click the level by its plain text.** `getByText('Medium', { exact: true })`
  times out because the button holds more text. The driver uses a non-exact
  match.
- **Forcing customers:** set `arrivals` to minutes at or before the next
  clock step, then call `tickClock`. Each new context starts with an empty
  localStorage, so there's never a **Continue** save in the way.
- **The player spawns on the sidewalk in the driveway** (tile 18,25), so the
  first car in waits for them for about 4 game seconds before pushing on.

## Troubleshooting

- `page.goto: net::ERR_CONNECTION_REFUSED` from the driver: the dev server
  isn't up. `npm run e2e` stops the server it started when it finishes, so
  start one again before using the driver.
- `locator.click: Timeout 30000ms exceeded` on `start`: the title screen
  changed its button text. Open a screenshot and fix the text in `driver.mjs`.
- A car or customer "stuck" after a short `wait`: check the frame rate
  before suspecting the code. Count `requestAnimationFrame` calls inside an
  `eval` over a few seconds.
