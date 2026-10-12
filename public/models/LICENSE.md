# Model credits

All models in this folder are by [Kenney](https://www.kenney.nl) and released under
[Creative Commons Zero (CC0)](http://creativecommons.org/publicdomain/zero/1.0/).

- `cars/`: [Car Kit](https://kenney.nl/assets/car-kit) 3.1 (GLB format, with its shared `Textures/colormap.png`)
- `furniture/`: [Furniture Kit](https://kenney.nl/assets/furniture-kit) (GLB format)
- `characters/`: [Mini Characters](https://kenney.nl/assets/mini-characters) (GLB format, with its shared `Textures/colormap.png`)

Only the models the game uses are copied here, compressed: the originals are in
`assets-src/models`. To add more, download the kit, copy the GLB files (and
`Textures/`) into `assets-src/models`, run `node scripts/compress-models.mjs`, then
register them in `src/scene/Props.tsx` (characters: `src/sim/characters.ts`).
