// Headless driver for the dealership game. Reads one command per line on stdin:
//
//   start [Easy|Medium|Hard]   open the page, New game at that level, close the guide
//   wait <ms>                  let the game run (real time)
//   shot <name>                screenshot to $SHOTS/<name>.png
//   eval <js>                  run <js> in the page as an async function body, with
//                              `useGame` (the zustand store) and `g` (= useGame.getState)
//                              in scope; prints whatever it returns, as JSON
//   click <text>               click the first element with that text
//   key <key>                  press a key (Playwright names: KeyT, Escape, Shift+KeyR...)
//   errors                     print page errors and console errors so far
//   quit                       close the browser
//
// Env: PW_CORE (playwright-core to use instead of the repo's own), URL (default
// http://localhost:5199/), SHOTS (default /tmp/dealership-shots).

import { mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'

const { chromium } = await import(process.env.PW_CORE ?? 'playwright-core')
const URL = process.env.URL ?? 'http://localhost:5199/'
const SHOTS = process.env.SHOTS ?? '/tmp/dealership-shots'
mkdirSync(SHOTS, { recursive: true })

// SwiftShader: there's no GPU in the container, and three.js needs WebGL.
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
})
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

async function run(line) {
  const [cmd, ...rest] = line.trim().split(' ')
  const arg = rest.join(' ')
  switch (cmd) {
    case '':
    case '#':
      return
    case 'start':
      await page.goto(URL)
      await page.getByText('New game').click()
      await page
        .getByText(arg || 'Medium')
        .first()
        .click()
      // A new game opens the how-to-play guide, which pauses the clock.
      await page.getByText("Let's go").click()
      return console.log('started', arg || 'Medium')
    case 'wait':
      return page.waitForTimeout(Number(arg))
    case 'shot':
      await page.screenshot({ path: `${SHOTS}/${arg}.png` })
      return console.log('shot', `${SHOTS}/${arg}.png`)
    case 'eval': {
      const result = await page.evaluate(async (body) => {
        // Vite serves the source, so this is the same store instance the game uses.
        const { useGame } = await import('/src/state/store.ts')
        const g = useGame.getState
        return new Function('useGame', 'g', `return (async () => { ${body} })()`)(useGame, g)
      }, arg)
      return console.log('eval', JSON.stringify(result))
    }
    case 'click':
      return page.getByText(arg).first().click()
    case 'key':
      return page.keyboard.press(arg)
    case 'errors':
      return console.log('errors', JSON.stringify(errors))
    case 'quit':
      await browser.close()
      process.exit(0)
    default:
      console.log('unknown command', cmd)
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  try {
    await run(line)
  } catch (e) {
    console.log('error', line, String(e).split('\n')[0])
  }
}
await browser.close()
