/**
 * 단어 학습 문항의 5초 제한 (KAN-347 4-2, 확정된 결정 「단어 5초 제한」「5초 제한 세부」 2026-11-15·16).
 *
 * - 5초는 앱 상수다. 서버는 제한 시간을 주지도 검증하지도 않는다 (KAN-360 Requirements 4).
 * - 답을 고르면 멈추고(제출 전 답 변경 가능), 앱 전환·화면 꺼짐(`visibilitychange` hidden) 때 멈췄다가 남은 시간부터 잇는다.
 * - 학습 단어 문항에만 있다. 레벨 테스트 어휘 문항(`progress/VocabularyItemScreen`)에는 없다.
 *
 * ## 늘 켜져 있다 (4-5, KAN-361)
 *
 * 시간 초과 답안(`timedOut`)은 서버 KAN-360이 받는다. 예전에는 서버보다 먼저 나가는 경우를 막으려고 빌드 변수로 꺼 두었는데,
 * 웹과 서버를 같은 날 prod에 올리기로 해서 스위치를 걷었다(2026-11-17). 배포 순서는 **서버 Release 먼저, 웹(App Release) 나중**이다 -
 * 거꾸로 가면 그 사이 시간 초과 답안이 400으로 거절된다. 끄는 길은 테스트용 `timeLimitMs={null}` 하나다.
 *
 * 남은 시간 계산은 아래 순수 함수 세 개다 — 시계(`now`)를 인자로 받아 가짜 타이머 없이도 시험할 수 있다.
 */

import { useEffect, useRef, useState } from 'react'

export const WORD_TIME_LIMIT_MS = 5000

/** 이 아래로 내려가면 막대가 벽돌색으로 바뀌고 흔들린다 (타일 11) */
export const WORD_TIME_WARNING_MS = 1000

/** `since`부터 `left`ms가 남았다. `since`가 null이면 멈춰 있다 */
export interface Countdown {
  left: number
  since: number | null
}

export function remainingMs(c: Countdown, now: number): number {
  return c.since === null ? c.left : Math.max(0, c.left - (now - c.since))
}

export function pauseCountdown(c: Countdown, now: number): Countdown {
  return c.since === null ? c : { left: remainingMs(c, now), since: null }
}

export function resumeCountdown(c: Countdown, now: number): Countdown {
  return c.since !== null ? c : { left: c.left, since: now }
}

/** 화면을 다시 그리는 간격. 4px 막대라 50ms 계단은 눈에 띄지 않는다 */
const TICK_MS = 50

/**
 * 남은 시간(ms). `limitMs`가 null이면 null이다. `paused`(답을 골랐다·제출 중·채점 뒤)거나 문서가 숨으면 멈춘다.
 * 0에 닿으면 `onExpire`를 한 번 부른다. 문항이 바뀌면 호출자가 `key`로 새로 세운다.
 */
export function useWordCountdown(limitMs: number | null, paused: boolean, onExpire: () => void): number | null {
  const [left, setLeft] = useState(limitMs)
  const state = useRef<Countdown | null>(null)
  const expired = useRef(false)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => {
    if (limitMs === null) return
    state.current ??= { left: limitMs, since: null }
    const sync = () => {
      const stop = paused || document.visibilityState === 'hidden'
      state.current = stop ? pauseCountdown(state.current!, Date.now()) : resumeCountdown(state.current!, Date.now())
    }
    const tick = () => {
      const r = remainingMs(state.current!, Date.now())
      setLeft(r)
      if (r <= 0 && !expired.current) {
        expired.current = true
        expire.current()
      }
    }
    const onVisibility = () => {
      sync()
      tick()
    }
    sync()
    const timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      state.current = pauseCountdown(state.current!, Date.now())
    }
  }, [limitMs, paused])

  return limitMs === null ? null : left
}
