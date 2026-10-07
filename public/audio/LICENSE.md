# Audio credits

All sound effects in this folder are by [Kenney](https://www.kenney.nl) and released under
[Creative Commons Zero (CC0)](http://creativecommons.org/publicdomain/zero/1.0/).

From [Interface Sounds](https://kenney.nl/assets/interface-sounds) 1.0:

- `sfx/click.ogg`: `click_002.ogg`
- `sfx/chime.ogg`: `glass_001.ogg`
- `sfx/pop.ogg`: `pluck_002.ogg`
- `sfx/open.ogg`: `open_001.ogg`
- `sfx/close.ogg`: `close_001.ogg`

From [RPG Audio](https://kenney.nl/assets/rpg-audio):

- `sfx/coin.ogg`: `handleCoins2.ogg`
- `sfx/paper.ogg`: `bookFlip1.ogg`
- `sfx/stamp.ogg`: `bookPlace2.ogg`
- `sfx/thud.ogg`: `doorClose_4.ogg`
- `sfx/scuff.ogg`: `cloth1.ogg`
- `sfx/shoo.ogg`: `clothBelt2.ogg`

From [Music Jingles](https://kenney.nl/assets/music-jingles):

- `sfx/sale.ogg`: `jingles_SAX10.ogg`
- `sfx/bell.ogg`: `jingles_STEEL10.ogg`

The water spray of a car wash has no file: it's filtered noise made in
`src/audio/samples.ts`. Nor has the fanfare that opens a sale weekend: a few
synthesized notes made there too. The rain on rainy days is the same: filtered noise made in
`src/audio/rain.ts`.

Only the sounds the game uses are copied here, renamed for what they do. To add more,
download the pack, copy the file across and register it in `src/audio/samples.ts`.

## Music

The tracks in `music/` are from [OpenGameArt](https://opengameart.org), all released under
[CC0](http://creativecommons.org/publicdomain/zero/1.0/). Credit isn't required, but the
authors asked for it kindly, so here it is. Each was loudness-matched (about −16 LUFS) and
re-encoded as OGG Vorbis and 128 kbps MP3 (for browsers without OGG); nothing else was changed.

- `music/title`: [Buy Something!](https://opengameart.org/content/shop-theme) by Cleyton Kauffman
- `music/morning`: [Which Brand Of Mustard Shall I Buy](https://opengameart.org/content/which-brand-of-mustard-shall-i-buy) by congusbongus
- `music/afternoon`: [Two Left Socks](https://opengameart.org/content/two-left-socks) by congusbongus
- `music/closing`: [Jazz n' brass loop](https://opengameart.org/content/jazz-n-brass-loop) by Emma_MA
- `music/summary`: [Slow Stride](https://opengameart.org/content/slow-stride) by isaiah658

To swap a track, keep its name (both `.ogg` and `.mp3`); `src/audio/music.ts` picks the
format the browser plays.
