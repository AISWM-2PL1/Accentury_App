import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRegionMap, REGION_MAP_GROUPS, REGION_MAP_METRO_LINES } from './regionMap'
import { REGIONS } from './regions'

/** 정본(앱 레포 `docs/assets/`)과 웹 사본. 테스트는 `web/`에서 돈다 */
const CANONICAL = resolve(__dirname, '../../../docs/assets/region-map.svg')
const WEB_COPY = resolve(__dirname, 'region-map.svg')

describe('지도 SVG 정본과 웹 사본 (KAN-347 7단계)', () => {
  it('웹 사본은 정본 docs/assets/region-map.svg와 바이트가 같다', () => {
    expect(readFileSync(WEB_COPY).equals(readFileSync(CANONICAL))).toBe(true)
  })

  it('정본은 path 25개(면 18 + 광역시 경계선 7)이고 지역 코드는 regions.ts의 열 개다', () => {
    const paths = parseRegionMap(readFileSync(CANONICAL, 'utf8'))
    expect(paths).toHaveLength(25)
    expect(new Set(paths.map((path) => path.region))).toEqual(new Set(REGIONS.map((region) => region.code)))
  })

  it('면은 지역마다 한 묶음이고, 광역시는 면과 경계선으로 두 번 쓰인다', () => {
    expect(REGION_MAP_GROUPS.map((group) => group.region).sort()).toEqual(REGIONS.map((region) => region.code).sort())
    expect(REGION_MAP_GROUPS.flatMap((group) => group.paths)).toHaveLength(18)
    expect(REGION_MAP_METRO_LINES).toHaveLength(7)
    // 경남 묶음은 경상남도·울산·부산 세 면이다 — 「경남 · 부산·울산 포함」의 근거
    expect(REGION_MAP_GROUPS.find((group) => group.region === 'GYEONGNAM')?.paths).toHaveLength(3)
  })
})
