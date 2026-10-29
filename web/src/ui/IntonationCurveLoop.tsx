/**
 * 억양 곡선 루프 — 분석 대기 화면의 움직이는 장식 (KAN-302).
 *
 * 제목 아래에 억양 곡선 하나를 왼쪽부터 긋고, 벽돌 점이 펜 끝처럼 그 곡선을 따라간다. 다 그으면
 * 잠깐 멈췄다가 처음부터 다시 긋는다. ux-ui.md §F 「분석 대기」가 원래 "곡선이 그려지는
 * 애니메이션"으로 설계했던 자리인데 구현에서 빠져 있었다 — 앱이 다루는 것이 억양 곡선이라 같은
 * 모양이 "지금 내 목소리를 곡선으로 만드는 중"이라고 말하고, 화면이 계속 움직이므로 단계 표시가
 * 한동안 그대로여도 "멈춘 것인지" 의심하지 않게 된다.
 *
 * ## 곡선 문자열이 상수 하나인 이유
 *
 * 같은 d를 두 군데가 쓴다: SVG `<path>`의 d와 점이 따라가는 CSS `offset-path`. CSS 파일에
 * 복사해 두면 한쪽만 고쳤을 때 점이 선을 벗어나 허공을 달린다. 그래서 `offset-path`는 인라인
 * style로 넣어 이 상수를 같이 쓴다.
 *
 * ## offset-path를 못 쓰는 브라우저
 *
 * `offset-path: path()`는 Safari 16+다 (MDN browser-compat-data `css.properties.offset-path.path`,
 * https://developer.mozilla.org/en-US/docs/Web/CSS/offset-path#browser_compatibility). 점은
 * `cx`/`cy` 속성을 곡선 끝점에 두고, 원점으로 옮기는 일(`cx: 0`)은 CSS `@supports` 안에서만
 * 한다. 지원하지 않으면 점이 (0,0) 구석에 서는 대신 곡선 끝에 멈춰, reduced-motion으로 접힌
 * 최종 상태와 같은 그림이 된다.
 *
 * ## 장식이다
 *
 * `aria-hidden`이다. 두 대기 화면 모두 화면 이름을 말하는 h1이 바로 옆에 있어, 곡선까지 이름을
 * 가지면 스크린 리더가 같은 화면을 두 번 소개한다 (`TextHero` 머리 주석과 같은 판단).
 */

const CURVE_D =
  'M2 26 C 20 26, 30 10, 52 12 S 84 32, 106 28 S 140 6, 166 10 S 200 34, 224 30 S 262 14, 284 18 S 304 24, 310 22'

export function IntonationCurveLoop() {
  return (
    <svg className="intonation-curve" viewBox="0 0 312 40" aria-hidden="true" focusable="false">
      <path className="intonation-curve__guide" d={CURVE_D} />
      <path className="intonation-curve__line" d={CURVE_D} pathLength={100} />
      {/* 끝점(310,22)은 CURVE_D의 마지막 좌표다 — offset-path 미지원 시 여기 멈춘다 */}
      <circle
        className="intonation-curve__dot"
        cx={310}
        cy={22}
        r={4}
        style={{ offsetPath: `path("${CURVE_D}")` }}
      />
    </svg>
  )
}
