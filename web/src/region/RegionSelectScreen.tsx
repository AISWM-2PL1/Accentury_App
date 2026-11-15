/**
 * 출신(모어 사투리) 지역 선택 화면 (KAN-202, 지도 서식은 KAN-347 7단계 시안 s-13-region-select-web-map).
 *
 * 웹 단독 실행 시작 게이트에 끼운 칸이다: 인트로 [시작하기] → 마이크 권한(KAN-56) → **여기** →
 * 목소리 점검 → 세션 생성(`startStandaloneTest`) → 문항 화면. 고른 값은 세션 생성 본문의
 * `region`(§3.1)으로 나가고, 서버가 그 값을 세션에 남기며 분석 결과를 S3에 남길 때 키의 지역
 * 조각으로 쓴다 (KAN-201, KAN-269). 음성 저장에 동의한 세션은 음성과 라벨을, 동의하지 않은 세션은
 * 음성 없이 점수와 지역 라벨만 남긴다 (KAN-274) — 그래서 동의 화면에서 무엇을 골랐든 이 화면이 선다.
 * 지역별로 결과를 뽑아 쓰기 위한 **라벨**이지 사용자에게 주는 기능이 아니다. 예전에는 빌드 스위치가
 * 켜진 번들(staging)에만 있던 화면인데 KAN-274가 스위치를 걷어내 두 환경 모두 늘 선다 (`regions.ts` 헤더).
 *
 * 묻는 것은 **출신 지역**이다. 라벨의 뜻이 "이 녹음의 화자가 어느 사투리 화자인가"라서, 부제가
 * "본인이 쓴다고 생각하는 억양의 지역"으로 그 기준을 한 줄로 못 박는다 (문안은 KAN-347 7단계 티켓).
 *
 * ## 왜 점검 앞인가
 *
 * 네트워크를 쓰지 않는 화면들(권한·지역·점검)을 세션 생성 **앞**에 모아 두면, 어디서 멈추든
 * 서버에 아무도 응시하지 않을 세션이 남지 않는다 (`IntroRoute`가 점검을 세션 앞에 둔 이유와
 * 같다). 점검 뒤에 두면 이미 잰 중심을 든 채 한 화면을 더 지나야 해서 얻는 것이 없다.
 *
 * ## 왜 저장소에 남기지 않는가
 *
 * 값은 세션을 만들 때 한 번만 쓰인다. 세션이 생기면 서버가 들고 있고, `?screen=test` 리로드
 * 뒤의 문항 화면은 이 값을 읽을 일이 없다. 그래서 `micGranted`와 같이 `IntroRoute`의 문서
 * 상태로만 산다 — 리로드하면 마이크 권한부터 다시 받는 흐름이라 지역도 다시 고르는 것이 맞다.
 *
 * ## 지도 위 칩이 네이티브 라디오인 이유
 *
 * 칩 열 개는 같은 `name`의 `<input type="radio">`다(어휘 문항의 `.choice__radio`처럼 눈에서만 지운다). 단일 선택, 방향키로 칩
 * 이동, 고른 칩만 Tab 순서에 드는 것(티켓 7-3 접근성 요구)을 브라우저가 그대로 준다 — 시안의 `role="radio"` 버튼은 그 셋을
 * 스크립트로 흉내 낸 것이다. 그룹 이름은 제목이다(`aria-labelledby`).
 *
 * 큰 글자(`html[data-large-text]`, `ui/textScale.ts`)에서는 지도를 걷고 같은 칩을 2열 목록으로 편다(`RegionSelectScreen.css`,
 * 확정된 결정 2026-11-16). 칩 글자가 rem이라 큰 글자 표식이 서는 순간부터 칩이 커져 좁은 자리(충북·충남)부터 겹친다 — 그래서
 * 칩을 따로 재지 않고 표식 하나를 겹침 판정으로 쓴다.
 */

import { useState, type CSSProperties } from 'react'
import { haptic } from '../bridge/bridge'
import { Button } from '../ui'
import { ArrowRightIcon } from '../ui/icons'
import { REGION_MAP_GROUPS, REGION_MAP_METRO_LINES, REGION_MAP_VIEW_BOX } from './regionMap'
import { REGIONS, type RegionCode } from './regions'
import './RegionSelectScreen.css'

export interface RegionSelectScreenProps {
  /** 고른 지역 코드를 호출자에게 넘긴다 — 세션 생성 본문의 `region`이 된다 */
  onDone: (region: RegionCode) => void
}

/** 시안 `.region-map` 상자. 칩 가운데 좌표·연결선은 이 상자(390 화면 − 좌우 24 = 342 × 420) 기준이다 */
const MAP_WIDTH = 342
const MAP_HEIGHT = 420

/**
 * 칩 가운데 좌표 (시안 칩 `--x`·`--y`, KAN-354 `RegionSelectScreen.kt`와 같은 값). 서울은 칩이 경기 면을 덮지 않게 서쪽으로
 * 빼고 연결선을 긋는다.
 */
const CHIP_POINTS: Record<RegionCode, readonly [number, number]> = {
  SEOUL: [70, 87],
  GYEONGGI: [151, 65],
  GANGWON: [216, 65],
  CHUNGBUK: [178, 148],
  CHUNGNAM: [117, 177],
  JEONBUK: [140, 228],
  JEONNAM: [121, 289],
  GYEONGBUK: [234, 180],
  GYEONGNAM: [210, 265],
  JEJU: [155, 395],
}

/** 칩의 스크린 리더 이름 (시안 `aria-label`): 「경남, 부산·울산 포함」 */
function chipName(region: (typeof REGIONS)[number]): string {
  return region.metro === null ? region.label : `${region.label}, ${region.metro} 포함`
}

/** 지도 아래 설명 한 줄 (시안 `.region-selection`): 「경남 · 부산·울산 포함」. 고르기 전에는 시안의 빈 상태 문구 */
function selectionLine(code: RegionCode | null): string {
  const region = REGIONS.find((r) => r.code === code)
  if (region === undefined) return '지도에서 지역을 눌러 주세요'
  return region.metro === null ? region.label : `${region.label} · ${region.metro} 포함`
}

export function RegionSelectScreen({ onDone }: RegionSelectScreenProps) {
  /*
   * 기본 선택은 없다. 라벨은 "모르겠으면 아무거나"가 아니라 이 화자의 실제 사투리 지역이라,
   * 처음부터 하나가 골라져 있으면 그냥 [다음]을 누른 사람의 녹음이 엉뚱한 지역으로 쌓인다.
   * 같은 이유로 건너뛰기도 없다.
   */
  const [selected, setSelected] = useState<RegionCode | null>(null)

  // 객관식 선택의 탭 햅틱 (KAN-258) — 어휘 문항과 같은 규칙. 웹 단독 실행에는 브리지가 없어 지금은 지나간다
  function choose(code: RegionCode) {
    haptic('tap')
    setSelected(code)
  }

  return (
    <main className="item-screen region-screen">
      <div>
        <h1 id="region-title" className="type-headline">
          어느 지역 말씨가 몸에 배어 있나요?
        </h1>
        <p className="type-label region-screen__lead">본인이 쓴다고 생각하는 억양의 지역을 골라 주세요</p>
      </div>

      <div className="item-screen__body region-screen__body">
        <div className="region-map" role="radiogroup" aria-labelledby="region-title">
          {/*
            면은 마우스·손가락 몫이다(누르면 그 지역을 고른다). 스크린 리더와 키보드는 칩 라디오로 고르므로 그림은 읽히지 않게 숨긴다.
            고른 지역 면은 벽돌로 칠한다 — 색만으로 알리지 않도록 칩도 반전된다(WCAG 1.4.1).
          */}
          <svg
            className="region-map__geography"
            viewBox={REGION_MAP_VIEW_BOX}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              {/* 지역 묶음마다 잉크 윤곽선 (시안 `#region-outline`) */}
              <filter id="region-outline" x="-10%" y="-10%" width="120%" height="120%">
                <feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d" />
                <feFlood floodColor="#1c1a17" />
                <feComposite in2="d" operator="in" result="o" />
                <feMerge>
                  <feMergeNode in="o" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {REGION_MAP_GROUPS.map(({ region, paths }) => (
              <g key={region} filter="url(#region-outline)">
                {paths.map((path) => (
                  <path
                    key={path.d}
                    data-region={region}
                    className={selected === region ? 'is-selected' : undefined}
                    d={path.d}
                    onClick={() => choose(region)}
                  />
                ))}
              </g>
            ))}
            <g className="region-map__metro-lines">
              {REGION_MAP_METRO_LINES.map((path) => (
                <path key={path.d} d={path.d} />
              ))}
            </g>
          </svg>
          {/* 서울 칩에서 서울 면까지 (시안 `svg.region-connector`) */}
          <svg
            className="region-map__connector"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M92 87 L128 87" />
          </svg>
          {REGIONS.map((region) => {
            const [x, y] = CHIP_POINTS[region.code]
            const position = { '--x': `${(x / MAP_WIDTH) * 100}%`, '--y': `${(y / MAP_HEIGHT) * 100}%` } as CSSProperties
            return (
              <label key={region.code} className="region-chip" style={position}>
                <input
                  className="region-chip__radio"
                  type="radio"
                  name="region"
                  value={region.code}
                  checked={selected === region.code}
                  aria-label={chipName(region)}
                  onChange={() => choose(region.code)}
                />
                <span className="region-chip__name" aria-hidden="true">
                  {region.label}
                </span>
              </label>
            )
          })}
        </div>
        {/* 사투리 여행 지도와 같은 출처 표기 (티켓 7-3). 지도를 걷는 큰 글자 목록에서는 같이 걷힌다 */}
        <p className="region-map__source">행정구역 경계: 통계청 SGIS(2013)</p>
        <p
          className={selected === null ? 'region-selection region-selection--empty' : 'region-selection'}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectionLine(selected)}
        </p>
      </div>

      <div className="item-screen__footer region-screen__footer">
        {/*
          라디오를 고르는 것과 확정은 다른 동작이다 — 잘못 눌러도 [다음] 전에는 바꿀 수 있어야
          한다. 고르기 전에는 넘길 값이 없으므로 버튼을 잠근다 (어휘 문항의 [다음]과 같다).
        */}
        <Button
          onClick={() => {
            if (selected !== null) onDone(selected)
          }}
          disabled={selected === null}
          style={{ width: '100%' }}
        >
          다음
          <ArrowRightIcon />
        </Button>
        {/* 점검 화면의 "저장하거나 보내지 않아요"와 같은 자리 — 이 값이 어디에 쓰이는지 한 줄 */}
        <p className="type-caption region-screen__note">이 정보는 억양 분석 모델을 다듬는 데만 써요</p>
      </div>
    </main>
  )
}
