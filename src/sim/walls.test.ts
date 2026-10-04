import { describe, expect, it } from 'vitest'
import { buildLayout } from './layout'
import { cameraSide, isCutaway, wallPieces, type WallPiece } from './walls'

const layout = buildLayout()
const pieces = wallPieces(layout)

const SE = Math.PI / 4 // default view: camera south-east of the focus
const NE = (3 * Math.PI) / 4
const NW = (5 * Math.PI) / 4
const SW = -Math.PI / 4

function piece(tx: number, tz: number, dir: WallPiece['dir']): WallPiece {
  const p = pieces.find((q) => q.tx === tx && q.tz === tz && q.dir === dir)
  if (!p) throw new Error(`no piece at ${tx},${tz} ${dir}`)
  return p
}

describe('wallPieces', () => {
  it('draws arms toward connected neighbours only', () => {
    const arms = pieces.filter((p) => p.tx === 19 && p.tz === 13).map((p) => p.dir)
    expect(arms.sort()).toEqual(['e', 'w'])
    const corner = pieces.filter((p) => p.tx === 16 && p.tz === 13).map((p) => p.dir)
    expect(corner.sort()).toEqual(['e', 'n'])
  })

  it('stops arms at doorways', () => {
    expect(pieces.filter((p) => p.tx === 20 && p.tz === 13).map((p) => p.dir)).toEqual(['w'])
    expect(pieces.some((p) => p.tx === 21 && p.tz === 13)).toBe(false)
  })

  it('does not join fences to building walls', () => {
    expect(pieces.filter((p) => p.kind === 'fence').every((p) => p.dir !== null)).toBe(true)
  })
})

describe('cameraSide', () => {
  it('maps each 45° view to the camera quadrant', () => {
    expect(cameraSide(SE)).toEqual({ sx: 1, sz: 1 })
    expect(cameraSide(NE)).toEqual({ sx: 1, sz: -1 })
    expect(cameraSide(NW)).toEqual({ sx: -1, sz: -1 })
    expect(cameraSide(SW)).toEqual({ sx: -1, sz: 1 })
  })
})

describe('isCutaway', () => {
  const southGlass = piece(19, 13, 'e')
  const northWall = piece(19, 2, 'e')
  const westGlass = piece(16, 6, 's')
  const eastWall = piece(36, 6, 's')
  const officePartition = piece(31, 8, 'e')
  const fence = piece(10, 24, 'e')

  it('drops the walls facing the camera from the south-east', () => {
    expect(isCutaway(layout, southGlass, SE)).toBe(true)
    expect(isCutaway(layout, eastWall, SE)).toBe(true)
    expect(isCutaway(layout, northWall, SE)).toBe(false)
    expect(isCutaway(layout, westGlass, SE)).toBe(false)
  })

  it('flips with the camera', () => {
    expect(isCutaway(layout, southGlass, NW)).toBe(false)
    expect(isCutaway(layout, eastWall, NW)).toBe(false)
    expect(isCutaway(layout, northWall, NW)).toBe(true)
    expect(isCutaway(layout, westGlass, NW)).toBe(true)
  })

  it('drops interior partitions from either side', () => {
    expect(isCutaway(layout, officePartition, SE)).toBe(true)
    expect(isCutaway(layout, officePartition, NE)).toBe(true)
  })

  it('never drops fences', () => {
    for (const yaw of [SE, NE, NW, SW]) expect(isCutaway(layout, fence, yaw)).toBe(false)
  })
})
