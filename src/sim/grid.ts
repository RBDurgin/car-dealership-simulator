export interface Tile {
  tx: number
  tz: number
}

export interface Vec2 {
  x: number
  z: number
}

/**
 * Walkability grid. One tile = one world unit, centered on the world origin
 * (tile 0,0 is the north-west corner, i.e. world -width/2, -height/2).
 */
export class Grid {
  readonly width: number
  readonly height: number
  private readonly blocked: Uint8Array
  /** Bumped by every change to the blocked tiles, so what's worked out from them knows to redo it. */
  private version = 0
  /** Each walkable tile's connected area (see `area`), and the version it was labelled at. */
  private readonly areas: Int32Array
  private areasVersion = -1

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.blocked = new Uint8Array(width * height)
    this.areas = new Int32Array(width * height)
  }

  inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < this.width && tz < this.height
  }

  index(tx: number, tz: number): number {
    return tz * this.width + tx
  }

  isWalkable(tx: number, tz: number): boolean {
    return this.inBounds(tx, tz) && this.blocked[this.index(tx, tz)] === 0
  }

  setBlocked(tx: number, tz: number, blocked = true): void {
    if (!this.inBounds(tx, tz)) return
    const i = this.index(tx, tz)
    const value = blocked ? 1 : 0
    if (this.blocked[i] === value) return
    this.blocked[i] = value
    this.version++
  }

  blockRect(tx: number, tz: number, w: number, h: number): void {
    this.setRectBlocked({ tx, tz, w, h }, true)
  }

  setRectBlocked(r: { tx: number; tz: number; w: number; h: number }, blocked: boolean): void {
    for (let z = r.tz; z < r.tz + r.h; z++) {
      for (let x = r.tx; x < r.tx + r.w; x++) this.setBlocked(x, z, blocked)
    }
  }

  /** Takes on `other`'s blocked tiles. It must be the same size. */
  copyFrom(other: Grid): void {
    this.blocked.set(other.blocked)
    this.version++
  }

  /**
   * The connected area tile `index` is in: walkable tiles share a number
   * exactly when one can be walked to from the other (a diagonal step needs
   * both sides open, so side-by-side steps connect the same tiles). -1 for a
   * blocked tile. Labelled again, all at once, on the first call after the
   * grid changes.
   */
  area(index: number): number {
    if (this.areasVersion !== this.version) this.labelAreas()
    return this.areas[index]
  }

  private labelAreas(): void {
    const { width, blocked, areas } = this
    areas.fill(-1)
    const queue = new Int32Array(areas.length)
    let label = -1
    let tail = 0
    const reach = (j: number) => {
      if (blocked[j] || areas[j] !== -1) return
      areas[j] = label
      queue[tail++] = j
    }
    for (let seed = 0; seed < areas.length; seed++) {
      if (blocked[seed] || areas[seed] !== -1) continue
      label++
      tail = 0
      reach(seed)
      // Flood out from it, a side step at a time.
      for (let head = 0; head < tail; head++) {
        const i = queue[head]
        const x = i % width
        if (x > 0) reach(i - 1)
        if (x < width - 1) reach(i + 1)
        if (i >= width) reach(i - width)
        if (i + width < areas.length) reach(i + width)
      }
    }
    this.areasVersion = this.version
  }

  tileToWorld(tx: number, tz: number): Vec2 {
    return { x: tx - this.width / 2 + 0.5, z: tz - this.height / 2 + 0.5 }
  }

  worldToTile(x: number, z: number): Tile {
    return { tx: Math.floor(x + this.width / 2), tz: Math.floor(z + this.height / 2) }
  }
}
