/**
 * 점수 원그래프 공용 부품 (KAN-347 1단계 1-4, `ResultScreen`에서 꺼냈다).
 *
 * 양식: viewBox 120, r 54, 바탕 원 잉크 1px 점선(3 5), 호 벽돌 두께 10·끝 둥글게·12시부터 시계 방향, 가운데 「N점」 Jua.
 * 쓰는 곳: 레벨 테스트 결과, 단어·억양 결과, 결과 상세, 카드 피드백, 코스 지도 완료 카드 — 자리마다 크기(`size`)만 바꾼다.
 *
 * `<svg>`로 그리는 이유: 원호의 길이를 stroke-dasharray로 정확히 잘라낼 수 있고, 확대·접근성 글자 크기에서도 화질이 유지된다.
 * 숫자를 원 안에 글자로도 적는다. 원호만으로는 72와 75를 구분할 수 없고, 원호는 스크린 리더에 아무것도 아니다.
 *
 * ## count-up (움직임 타일 6·12)
 *
 * `countUp`을 켜면 0점에서 N점까지 600ms(`--duration-reveal`)로 숫자와 호가 함께 자란다. 시간은 토큰을 읽는다 —
 * 동작 줄이기에서는 토큰이 0.01ms로 접히고(tokens.css), `prefers-reduced-motion`도 따로 보아 끝 값을 바로 그린다.
 * 도는 동안 바뀌는 숫자는 눈에만 보이고(`aria-hidden`), 스크린 리더에는 끝 값 한 줄만 둔다 — 매 프레임 바뀌는 글자를
 * 읽히면 소음이다.
 */

import { useEffect, useState, type CSSProperties } from 'react'

export interface ScoreDonutProps {
  score: number
  /** 원 지름(px). 기본은 레벨 테스트 결과의 96. 큰 글자에서는 글자와 함께 커진다 */
  size?: number
  /** 스크린 리더에만 읽히는 이름 (예: 「종합 점수」). 화면에서는 배치가 이름을 말한다 */
  label?: string
  /** 0 → N점 count-up. 결과 화면 진입 움직임 (2·4·5단계) */
  countUp?: boolean
}

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** 토큰을 읽지 못할 때(jsdom 등)의 값 — `--duration-reveal`과 같다 */
const FALLBACK_REVEAL_MS = 600

export function ScoreDonut({ score, size, label, countUp = false }: ScoreDonutProps) {
  const shown = useCountUp(score, countUp)
  // 서버가 0~100을 보장하지만, 배포 사고로 벗어난 값이 오면 원호가 한 바퀴를 넘어 그려진다. 그림만 가둔다 —
  // 숫자는 받은 그대로 보여야 이상을 알아챌 수 있다.
  const filled = Math.min(Math.max(shown, 0), 100)
  const style =
    size === undefined
      ? undefined
      : ({ '--score-donut-size': `${size}px`, '--score-donut-scale': size / 96 } as CSSProperties)

  return (
    <div className="score-donut" style={style}>
      <svg className="score-donut__ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle className="score-donut__track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="score-donut__value"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - filled / 100)}
          // 숫자가 프레임마다 직접 움직이는 동안은 CSS 전환을 끈다 — 켜 두면 호가 숫자보다 늦게 따라온다
          style={countUp ? { transition: 'none' } : undefined}
        />
      </svg>
      <div className="score-donut__label">
        {label !== undefined && <span className="sr-only">{label}</span>}
        {countUp ? (
          <>
            <span className="type-headline score-donut__score" aria-hidden="true">
              {shown}점
            </span>
            <span className="sr-only">{score}점</span>
          </>
        ) : (
          <span className="type-headline score-donut__score">{score}점</span>
        )}
      </div>
    </div>
  )
}

/** 0에서 target까지 정수로 센다. 꺼져 있거나 동작 줄이기면 처음부터 target이다 */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(() => (enabled && !instantReveal() ? 0 : target))
  useEffect(() => {
    if (!enabled || instantReveal()) {
      setValue(target)
      return
    }
    const duration = revealMs()
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      // --ease-out(0, 0, 0.2, 1)에 가까운 감속 — 끝으로 갈수록 천천히 멈춘다
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    setValue(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, enabled])
  return value
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `--duration-reveal` 토큰(ms). 동작 줄이기에서는 0.01ms로 접힌다 */
function revealMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-reveal').trim()
  const ms = raw.endsWith('ms') ? parseFloat(raw) : raw.endsWith('s') ? parseFloat(raw) * 1000 : NaN
  return Number.isFinite(ms) ? ms : FALLBACK_REVEAL_MS
}

function instantReveal(): boolean {
  return reducedMotion() || revealMs() < 1
}
