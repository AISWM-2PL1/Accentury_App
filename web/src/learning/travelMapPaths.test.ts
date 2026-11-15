import { describe, expect, it } from 'vitest'
import { tapeOffset, zoomFrame } from './TravelScreens'
import { COURSE_NODES, COURSE_REGION_BOXES, COURSE_REGIONS } from './travelMapPaths'

type Point = readonly [number, number]

/** M/L/Z만 쓰는 경계 → 고리 목록(확대 후 화면 좌표) */
function rings(course: number): Point[][] {
  const [x, y, w, h] = COURSE_REGION_BOXES[course - 1]
  const scale = Math.min(330 / w, 420 / h)
  const left = (390 - w * scale) / 2
  return COURSE_REGIONS[course - 1]
    .split('M')
    .filter(Boolean)
    .map((ring) =>
      ring
        .replace(/Z/g, '')
        .split('L')
        .map((p) => {
          const [px, py] = p.trim().split(/\s+/).map(Number)
          return [left + (px - x) * scale, 30 + (py - y) * scale] as const
        }),
    )
}

function inside(rs: Point[][], [x, y]: Point) {
  let hit = false
  for (const r of rs)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[i]
      const [bx, by] = r[j]
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit
    }
  return hit
}

function edgeDistance(rs: Point[][], [x, y]: Point) {
  let min = Infinity
  for (const r of rs)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[i]
      const [bx, by] = r[j]
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
      min = Math.min(min, Math.hypot(x - ax - t * dx, y - ay - t * dy))
    }
  return min
}

describe('코스 지도 번호 원 자리', () => {
  it.each([1, 2, 3, 4, 5])('%i코스: 번호 원 9개가 구역 안에 있고 서로 겹치지 않는다', (course) => {
    expect(COURSE_NODES[course - 1]).toHaveLength(9)
    const frame = zoomFrame(course)
    const rs = rings(course)
    const points = Array.from({ length: 9 }, (_, i) => frame.node(i))
    for (const p of points) {
      expect(inside(rs, p)).toBe(true)
      // 반지름 16 + 여유 2
      expect(edgeDistance(rs, p)).toBeGreaterThanOrEqual(18)
    }
    for (let i = 0; i < 9; i++)
      for (let j = i + 1; j < 9; j++)
        expect(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1])).toBeGreaterThanOrEqual(34)
  })

  it.each([1, 2, 3, 4, 5])('%i코스: 「지금 여기」 꼬리표가 다른 번호 원을 가리지 않는다', (course) => {
    const frame = zoomFrame(course)
    const points = Array.from({ length: 9 }, (_, i) => frame.node(i))
    points.forEach((_, i) => {
      const [ox, oy] = tapeOffset(points, i)
      const cx = points[i][0] + ox
      const cy = points[i][1] + oy
      points.forEach(([px, py], j) => {
        if (j === i) return
        const dx = px - Math.max(cx - 31.5, Math.min(px, cx + 31.5))
        const dy = py - Math.max(cy - 9, Math.min(py, cy + 9))
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(16)
      })
    })
  })
})
