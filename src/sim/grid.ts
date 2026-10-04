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

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.blocked = new Uint8Array(width * height)
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
    if (this.inBounds(tx, tz)) this.blocked[this.index(tx, tz)] = blocked ? 1 : 0
  }

  blockRect(tx: number, tz: number, w: number, h: number): void {
    this.setRectBlocked({ tx, tz, w, h }, true)
  }

  setRectBlocked(r: { tx: number; tz: number; w: number; h: number }, blocked: boolean): void {
    for (let z = r.tz; z < r.tz + r.h; z++) {
      for (let x = r.tx; x < r.tx + r.w; x++) this.setBlocked(x, z, blocked)
    }
  }

  tileToWorld(tx: number, tz: number): Vec2 {
    return { x: tx - this.width / 2 + 0.5, z: tz - this.height / 2 + 0.5 }
  }

  worldToTile(x: number, z: number): Tile {
    return { tx: Math.floor(x + this.width / 2), tz: Math.floor(z + this.height / 2) }
  }
}
