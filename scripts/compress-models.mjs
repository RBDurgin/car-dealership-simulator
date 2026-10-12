// Compresses the game's models from `assets-src/models` into `public/models`
// (Phase 18e). Run it after adding or changing a model:
//
//   node scripts/compress-models.mjs
//
// Every model is deduplicated, pruned, quantized (KHR_mesh_quantization) and
// meshopt-compressed (EXT_meshopt_compression, decoded by drei's useGLTF), and
// its texture is embedded in the GLB. Cars and furniture are also flattened and
// joined, so each draws as one mesh per material: a car's five or six parts
// (body and wheels, one material) become one draw call. Characters keep their
// skeleton and their two named meshes (scene/Character tints `body-mesh`), and
// only the clips the game plays (`CharacterAnim` in src/sim/characters.ts).
import { mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  dedup,
  flatten,
  join as joinMeshes,
  meshopt,
  prune,
  quantize,
  resample,
} from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'assets-src/models')
const OUT = join(ROOT, 'public/models')

/** Kept in step with `CharacterAnim` in src/sim/characters.ts. */
const CLIPS = new Set(['idle', 'walk', 'sprint', 'sit', 'emote-yes', 'emote-no', 'interact-right'])
/** In the kit but not in the game (female-a holds crutches; see src/sim/characters.ts). */
const UNUSED = new Set(['characters/character-female-a.glb'])

await MeshoptEncoder.ready
const io = new NodeIO()
  .setLogger(new Logger(Logger.Verbosity.WARN))
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

/** Drops the clips the game never plays. */
function keepClips(doc) {
  for (const anim of doc.getRoot().listAnimations()) {
    if (!CLIPS.has(anim.getName())) anim.dispose()
  }
}

async function glbs(dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const path = join(dir, name)
    if ((await stat(path)).isDirectory()) out.push(...(await glbs(path)))
    else if (name.endsWith('.glb')) out.push(path)
  }
  return out
}

let before = 0
let after = 0
for (const src of await glbs(SRC)) {
  const rel = relative(SRC, src)
  if (UNUSED.has(rel)) continue
  const skinned = rel.startsWith('characters/')
  const doc = await io.read(src)
  if (skinned) keepClips(doc)
  await doc.transform(
    dedup(),
    ...(skinned ? [resample()] : [flatten(), joinMeshes({ keepNamed: false })]),
    prune(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  const dest = join(OUT, rel)
  await mkdir(dirname(dest), { recursive: true })
  await io.write(dest, doc)
  const a = (await stat(src)).size
  const b = (await stat(dest)).size
  before += a
  after += b
  console.log(
    `${rel.padEnd(42)} ${(a / 1024).toFixed(0).padStart(5)} KB → ${(b / 1024).toFixed(0).padStart(4)} KB`,
  )
}
console.log(`total ${(before / 2 ** 20).toFixed(2)} MB → ${(after / 2 ** 20).toFixed(2)} MB`)
