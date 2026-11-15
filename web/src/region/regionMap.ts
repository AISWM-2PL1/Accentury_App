/**
 * 출신 지역 지도의 경계 (KAN-347 7단계).
 *
 * 정본은 앱 레포 `docs/assets/region-map.svg`이고(통계청 SGIS 2013 경계를 10개 지역으로 묶어 단순화, 출처·가공은 code wiki
 * `region-map.md`), 이 폴더의 `region-map.svg`는 그 바이트 동일 사본이다. 웹 개발 서버(`server.fs`)가 `web/` 밖을 읽지 않아
 * 사본을 둔다. 둘이 같은지는 `regionMap.test.ts`가 본다 — Android 사본(`app/src/main/assets/region-map.svg`)은 `RegionMapTest`가 본다.
 */

import regionMapSvg from './region-map.svg?raw'
import { isRegionCode, type RegionCode } from './regions'

/** 정본 SVG의 viewBox. 지도 칸(시안 342 × 420)에 늘려 채운다(시안 `preserveAspectRatio="none"`) */
export const REGION_MAP_VIEW_BOX = '0 -8 300 335'

/** path 하나. `metro`는 광역시·세종(`data-metro="1"`)이고, 고르면 자기 묶음 지역(`region`)으로 골라진다 */
export interface RegionMapPath {
  region: RegionCode
  metro: boolean
  d: string
}

/** 정본 글을 문서 순서대로 path 목록으로 나눈다. 모르는 지역 코드가 있으면 던진다 — 정본이 `regions.ts`와 어긋났다는 뜻이다 */
export function parseRegionMap(svg: string): RegionMapPath[] {
  return [...svg.matchAll(/<path\s([^>]*)\/>/g)].map(([, attrs]) => {
    const region = /data-region="([A-Z]+)"/.exec(attrs)?.[1]
    const d = /\sd="([^"]+)"/.exec(attrs)?.[1]
    if (!isRegionCode(region) || d === undefined) throw new Error(`region-map.svg: 읽을 수 없는 path (${attrs.slice(0, 60)})`)
    return { region, metro: attrs.includes('data-metro="1"'), d }
  })
}

/*
 * 정본은 광역시 path를 두 번 싣는다(면 한 번, 위에 긋는 경계선 한 번 — 시안 `.metro-lines`). 같은 `d`라 겹침을 걷어 면은 한 번만
 * 칠하고, 광역시는 그 위에 경계선으로 한 번 더 긋는다.
 */
const distinct = parseRegionMap(regionMapSvg).filter((path, index, all) => all.findIndex((p) => p.d === path.d) === index)

/** 지역 묶음별 면. 정본 문서에 처음 나오는 순서가 곧 그리는 순서다(뒤에 오는 묶음이 위) */
export const REGION_MAP_GROUPS: ReadonlyArray<{ region: RegionCode; paths: RegionMapPath[] }> = [
  ...new Set(distinct.map((path) => path.region)),
].map((region) => ({ region, paths: distinct.filter((path) => path.region === region) }))

/** 광역시·세종 경계선 */
export const REGION_MAP_METRO_LINES: readonly RegionMapPath[] = distinct.filter((path) => path.metro)
