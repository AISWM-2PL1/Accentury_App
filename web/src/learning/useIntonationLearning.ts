/**
 * 억양 학습 A-1·A-2(+ A-3 회신 자리)의 상태 (KAN-253 1단계). 구조는 [useWordLearning]의 거울이다 —
 * `?screen=intonation` 한 문서 안에서 `view`만 바꾸고, 실패는 `{ screen: 'error' }` 하나로 모아
 * 출구를 `errorExit`(단어 학습과 같은 함수)이 code로 가른다. 이탈은 시스템 뒤로가기만(2026-10-12 착수 결정).
 *
 * 녹음은 네이티브가 화면·업로드까지 끝내고 성공한 경우에만 `onIntonationRecorded`로 회신한다.
 * 회신이 오면 'waiting'(A-4 분석 대기, KAN-254 2단계)으로 가 채점 결과를 폴링한다. 완료면 'feedback',
 * 오독·조용함·분석 실패·60초 소진이면 'retry'다. 회신이 없으면(업로드 전 뒤로가기) A-2 그대로다.
 *
 * 5단계(2026-10-12 사용자 결정): 카드에 들어서는 순간(코스 상세 로드 성공, [다음 카드]) 녹음 화면을
 * 자동으로 한 번 연다 — 녹음 대기 화면이 카드 n/N·대사·곡선을 다 보여 A-2와 중복이었다. 그래서 A-2는
 * 녹음 화면을 뒤로가기로 닫았을 때 드러나는 일시정지 화면이다. 호출은 effect가 아니라 그 전이를 만든
 * 비동기 작업·클릭 핸들러 안에서 한다 — StrictMode가 effect를 두 번 돌려도 두 번 열리지 않게.
 */

import { useEffect, useState } from 'react'
import { planNextPoll } from '../analysis/pollSchedule'
import { installIntonationRecordedReceiver, startIntonationRecording } from '../bridge/bridge'
import type { WordApiDeps } from './wordApi'
import { WordLearningError } from './wordApi'
import {
  fetchIntonationAttempt,
  fetchIntonationCourse,
  fetchIntonationCourses,
  type IntonationCourse,
  type IntonationCourseSummary,
  type PitchFeedbackItem,
} from './intonationApi'
import { attemptOutcome } from './intonationFeedback'

/** 녹음 최대 길이 — 레벨테스트 음성 문항과 같은 10초 컷 (KAN-253 브리지 계약) */
const MAX_DURATION_MS = 10_000

/** 카드 하나의 녹음 화면을 연다. 브리지가 없거나(브라우저 단독) 카드가 없으면 false */
export function recordCard(course: IntonationCourse, index: number): boolean {
  const card = course.cards[index]
  if (card === undefined) return false
  return startIntonationRecording({
    cardId: card.cardId,
    prompt: card.dialect,
    standard: card.standard,
    maxDurationMs: MAX_DURATION_MS,
    guideF0: card.guideF0,
    itemNumber: index + 1,
    totalItems: course.cards.length,
  })
}

export type IntonationLearningView =
  | { screen: 'loading' }
  | { screen: 'list'; courses: IntonationCourseSummary[] }
  | { screen: 'card'; course: IntonationCourse; index: number }
  /** A-4 분석 대기 — 이 view인 동안만 attemptId를 폴링한다 */
  | { screen: 'waiting'; course: IntonationCourse; index: number; attemptId: string }
  /** 폴링이 멈춘 실패. timeout만 [다시 시도](같은 attemptId), 나머지는 [다시 녹음] */
  | {
      screen: 'retry'
      course: IntonationCourse
      index: number
      attemptId: string
      reason: 'timeout' | 'failed' | 'misread' | 'quiet'
    }
  /** 채점 완료. 본 화면(어절 강조·곡선·코멘트·직전 대비)은 KAN-254 3단계 */
  | {
      screen: 'feedback'
      course: IntonationCourse
      index: number
      attemptId: string
      score: number
      feedback: PitchFeedbackItem[]
      previousScore: number | null
    }
  /** fromList: 목록 조회 실패 — 돌아갈 목록이 없으니 재시도 불가여도 [다시 시도]다 */
  | { screen: 'error'; error: WordLearningError; retry: () => void; fromList: boolean }

function toError(error: unknown): WordLearningError {
  if (error instanceof WordLearningError) return error
  return new WordLearningError(error instanceof Error ? error.message : String(error), null, true)
}

export function useIntonationLearning(apiBase: string, deps: WordApiDeps = {}) {
  const [view, setView] = useState<IntonationLearningView>({ screen: 'loading' })

  const run = (task: () => Promise<IntonationLearningView>, fromList = false) => {
    setView({ screen: 'loading' })
    task().then(setView, (error: unknown) =>
      setView({ screen: 'error', error: toError(error), retry: () => run(task, fromList), fromList }),
    )
  }

  const backToList = () =>
    run(async () => ({ screen: 'list', courses: (await fetchIntonationCourses(apiBase, deps)).courses }), true)

  // 진입 시 목록 한 번 (useWordLearning과 같은 이유로 StrictMode 이중 조회는 막지 않는다)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(backToList, [])

  const openCourse = (courseId: string) =>
    run(async () => {
      const course = await fetchIntonationCourse(apiBase, courseId, deps)
      recordCard(course, 0) // 카드 진입 = 녹음 화면 자동 호출 (5단계). [다시 시도]도 이 작업을 다시 돌려 1회다
      return { screen: 'card', course, index: 0 }
    })

  // A-2에 있는 동안만 회신을 듣는다. 지금 카드의 회신만 받는다 — 늦게 온 앞 카드 회신이 화면을 넘기지 않게
  const listeningCardId = view.screen === 'card' ? view.course.cards[view.index]?.cardId : undefined
  useEffect(() => {
    if (listeningCardId === undefined) return
    return installIntonationRecordedReceiver(({ cardId, attemptId }) => {
      if (cardId !== listeningCardId) return
      setView((v) => (v.screen === 'card' ? { screen: 'waiting', course: v.course, index: v.index, attemptId } : v))
    })
  }, [listeningCardId])

  /*
   * A-4 폴링. 간격·60초 예산은 레벨테스트와 같은 `planNextPoll`이다(서버 pollAfterMs와 백오프의 max, 지터).
   * 혼잡 예산은 안 쓴다 — 학습 응답엔 queue 안내가 없다. 'waiting' 객체가 바뀌면([다시 시도]) 예산부터 새로 선다.
   * view가 바뀌거나 언마운트되면 타이머를 지우고 늦게 온 응답은 버린다.
   */
  const waiting = view.screen === 'waiting' ? view : null
  useEffect(() => {
    if (waiting === null) return
    const { course, index, attemptId } = waiting
    const startedAt = Date.now()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let round = 0
    let serverPollAfterMs: number | null = null
    const retry = (reason: 'timeout' | 'failed' | 'misread' | 'quiet') =>
      setView({ screen: 'retry', course, index, attemptId, reason })

    const tick = async () => {
      try {
        const attempt = await fetchIntonationAttempt(apiBase, attemptId, deps)
        if (cancelled) return
        serverPollAfterMs = attempt.pollAfterMs
        const outcome = attemptOutcome(attempt)
        if (outcome.kind === 'completed') {
          const { score, feedback, previousScore } = outcome
          setView({ screen: 'feedback', course, index, attemptId, score, feedback, previousScore })
          return
        }
        if (outcome.kind !== 'processing') return retry(outcome.kind)
      } catch (error) {
        if (cancelled) return
        // 네트워크·5xx는 한 회차로 세고 계속 돈다. 권한·없는 시도·로그인은 기존 오류 화면의 출구 규칙으로
        const e = toError(error)
        if (!e.retryable) {
          setView({ screen: 'error', error: e, retry: backToList, fromList: false })
          return
        }
      }
      const plan = planNextPoll({ round, elapsedMs: Date.now() - startedAt, serverPollAfterMs, retryAfterMs: null })
      if (plan.kind === 'EXHAUSTED') return retry('timeout')
      round += 1
      timer = setTimeout(() => void tick(), plan.delayMs)
    }
    void tick()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting])

  /**
   * 피드백의 [다음 카드] — 마지막 카드에서는 화면이 [코스 목록으로]를 대신 그린다.
   * setView 갱신 함수는 StrictMode가 두 번 부르므로 브리지 호출은 그 밖, 클릭 한 번에 한 번만 둔다
   */
  const nextCard = () => {
    if (view.screen !== 'feedback' || view.index + 1 >= view.course.cards.length) return
    const index = view.index + 1
    setView({ screen: 'card', course: view.course, index })
    recordCard(view.course, index)
  }

  /** 60초 소진의 [다시 시도] — 같은 attemptId로 새 'waiting'을 세워 예산을 리셋한다 */
  const retryPolling = () => {
    if (view.screen !== 'retry') return
    setView({ screen: 'waiting', course: view.course, index: view.index, attemptId: view.attemptId })
  }

  /** 실패의 [다시 녹음] — 같은 카드로 돌아가 녹음 화면을 1회 연다. card 뷰라야 회신 수신기가 새 attemptId를 받는다 */
  const rerecord = () => {
    if (view.screen !== 'retry') return
    setView({ screen: 'card', course: view.course, index: view.index })
    recordCard(view.course, view.index)
  }

  return { view, backToList, openCourse, nextCard, retryPolling, rerecord }
}
