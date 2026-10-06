/**
 * 출신(모어 사투리) 지역 코드 표 (KAN-202, API 명세서 §3.1 `region`).
 *
 * 이 표는 백엔드 `session/Region.java`의 거울이다 — 코드 문자열이 그대로 요청 본문에 실리고,
 * 서버는 열 개 밖의 값(대소문자가 다른 것, 저장 전용 `UNKNOWN` 포함)을 400 `VALIDATION_FAILED`로
 * 돌려준다. 그래서 여기서 코드를 하나라도 바꾸면 백엔드도 같이 바꿔야 한다. 표기와 순서는 KAN-202
 * 표를 따르고, 화면이 지역을 나열하는 순서도 이 배열 순서다 — 따로 정렬하면 기획표와 화면이 갈린다.
 *
 * ## 빌드 스위치는 없다 (KAN-274)
 *
 * KAN-202는 선택 화면을 빌드 변수가 켜진 번들(staging)에만 넣었다. 2026-10-06에
 * 두 환경이 같은 값이 되면서 스위치가 환경을 가르지 않게 됐고, KAN-274가 스위치를 걷어냈다. 웹 단독
 * 실행이면 어느 환경에서든 음성 저장 동의 화면 다음에 지역 선택 화면이 서고, 세션 생성 본문에
 * `region`이 실린다. 동의 화면에서 체크했는지와는 무관하다 — 서버가 동의하지 않은 익명 세션도 음성 없이
 * 점수와 지역을 남기기 때문이다. 끄려면 되돌림 PR과 승격이 필요하다.
 */

export const REGIONS = [
  { code: 'SEOUL', label: '서울' },
  { code: 'GYEONGGI', label: '경기' },
  { code: 'GANGWON', label: '강원' },
  { code: 'CHUNGBUK', label: '충북' },
  { code: 'CHUNGNAM', label: '충남' },
  { code: 'JEONBUK', label: '전북' },
  { code: 'JEONNAM', label: '전남' },
  { code: 'GYEONGBUK', label: '경북' },
  { code: 'GYEONGNAM', label: '경남' },
  // 지라 표는 '제주도'였다 - 2026-09-11 다른 지역과 표기를 통일해 '제주'로 (팀장 결정).
  { code: 'JEJU', label: '제주' },
] as const

/** 서버가 받아 주는 코드 열 개. `UNKNOWN`은 서버 저장 전용이라 여기 없다 */
export type RegionCode = (typeof REGIONS)[number]['code']

/**
 * 값이 표의 코드인가. 대소문자가 다른 값(`'seoul'`)도 아니다 — 서버가 `name().equals`로
 * 비교하므로 여기서 통과시키면 400이다.
 */
export function isRegionCode(value: unknown): value is RegionCode {
  return typeof value === 'string' && REGIONS.some((region) => region.code === value)
}
