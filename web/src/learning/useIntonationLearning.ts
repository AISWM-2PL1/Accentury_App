/**
 * 억양 학습 A-2(+ A-3 회신 자리)~결과 목록의 상태 (KAN-253 1단계). 구조는 [useWordLearning]의 거울이다 — 코스 하나(스탬프 하나)를
 * 받아 첫 카드부터 시작하고(코스 목록 A-1은 사투리 여행 지도로 대체, KAN-347 3단계), 학습 탭 문서 안에서 `view`만 바꾼다.
 * 실패는 `{ screen: 'error' }` 하나로 모아 출구를 `errorExit`(단어 학습과 같은 함수)이 code로 가른다. 나가는 길(지도로)은 라우트가 쥔다.
 *
 * 녹음은 네이티브가 화면·업로드까지 끝내고 성공한 경우에만 `onIntonationRecorded`로 회신한다.
 * 회신이 없으면(업로드 전 뒤로가기) A-2 그대로다.
 *
 * KAN-254 5단계(2026-10-12 에뮬 확인 뒤 사용자 결정, 지라 코멘트 10697): 카드마다 결과를 보여 주지 않는다.
 * 회신이 오면 바로 다음 카드 녹음을 열고 채점은 카드별로 뒤에서 폴링해 `results`에 쌓는다. 마지막 회신 뒤
 * 분석 중인 카드가 남았으면 'waiting'(A-4), 모두 끝나면(완료·실패·소진) 'summary'(결과 목록). 행을 누르면
 * 'detail' — 그 카드 결과가 분석 중이면 A-4, 완료면 A-5, 실패·소진이면 실패 출구를 그린다.
 *
 * 5단계(2026-10-12 사용자 결정): 카드에 들어서는 순간(코스 상세 로드 성공, [다음 카드]) 녹음 화면을
 * 자동으로 한 번 연다 — 녹음 대기 화면이 카드 n/N·대사·곡선을 다 보여 A-2와 중복이었다. 그래서 A-2는
 * 녹음 화면을 뒤로가기로 닫았을 때 드러나는 일시정지 화면이다. 호출은 effect가 아니라 그 전이를 만든
 * 비동기 작업·클릭 핸들러 안에서 한다 — StrictMode가 effect를 두 번 돌려도 두 번 열리지 않게.
 *
 * KAN-347 5단계: 'summary'는 성적표(s-07-A)다. 「코스 별」 줄의 끝난 뒤 값은 마지막 채점이 끝난 뒤 구간 요약(KAN-359)을
 * 다시 받아 만든다(`levels`). 들어가기 전 코스 별이 없으면(KAN-359 전) 부르지 않는다 — 단어 흐름(`useWordLearning`)과 같은 규칙.
 */

import { useEffect, useRef, useState } from 'react'
import { planNextPoll, POLL_BUDGET_MS } from '../analysis/pollSchedule'
import { installIntonationRecordedReceiver, startIntonationRecording } from '../bridge/bridge'
import type { WordApiDeps } from './wordApi'
import { WordLearningError } from './wordApi'
import {
  fetchIntonationAttempt,
  fetchIntonationCourse,
  type IntonationCourse,
  type PitchFeedbackItem,
} from './intonationApi'
import { attemptOutcome } from './intonationFeedback'
import { fetchLearningLevelsOrNull, type LearningLevels } from './travel'

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

/** 카드 하나의 채점 상태. outcome은 [attemptOutcome]의 kind에 클라이언트 60초 소진(timeout)을 더한 것 */
export type CardResult =
  | { attemptId: string; outcome: 'processing' | 'misread' | 'quiet' | 'failed' | 'timeout' }
  | { attemptId: string; outcome: 'completed'; score: number; feedback: PitchFeedbackItem[]; previousScore: number | null }

export type IntonationLearningView =
  | { screen: 'loading' }
  /** revisit: 결과 목록에서 그 카드만 다시 녹음하러 온 복귀 모드 — 회신 뒤 다음 카드가 아니라 그 카드 상세로 간다 */
  | { screen: 'card'; course: IntonationCourse; index: number; revisit: boolean }
  /** 마지막 회신 뒤 A-4 — 분석 중인 카드가 다 끝나면 'summary'로 넘어간다 */
  | { screen: 'waiting'; course: IntonationCourse }
  | { screen: 'summary'; course: IntonationCourse }
  /**
   * 성적표의 한 대사. 무엇을 그릴지는 results[그 카드]가 정한다. afterRecording: 상세에서 다시 녹음한 뒤의 카드 피드백(s-19)이면 true,
   * 성적표에서 연 결과 상세(s-08-intonation-detail)면 false — 둘은 「결과 목록으로」 자리만 다르다
   */
  | { screen: 'detail'; course: IntonationCourse; index: number; afterRecording: boolean }
  | { screen: 'error'; error: WordLearningError; retry: () => void; fromList: boolean }

function toError(error: unknown): WordLearningError {
  if (error instanceof WordLearningError) return error
  return new WordLearningError(error instanceof Error ? error.message : String(error), null, true)
}

export function useIntonationLearning(
  apiBase: string,
  courseId: string,
  deps: WordApiDeps = {},
  /** 성적표 「코스 별」 줄의 전 값 (KAN-347 5-4). stars가 null이면 KAN-359 전이라 구간 요약을 부르지 않는다 */
  before: { course: number; stars: { collected: number } | null } | null = null,
) {
  const [view, setView] = useState<IntonationLearningView>({ screen: 'loading' })
  const [results, setResults] = useState<Record<string, CardResult>>({})
  /** 끝난 뒤 구간 요약 (KAN-359). 없거나 실패면 null — 「코스 별」 줄을 숨기고 별 경계는 앱 상수 */
  const [levels, setLevels] = useState<LearningLevels | null>(null)
  const loadLevels = () => fetchLearningLevelsOrNull(apiBase, deps)
  /** cardId → 그 카드 폴링 취소. 같은 카드를 다시 올리면 앞 시도 폴링을 끊는다 */
  const polls = useRef(new Map<string, () => void>())

  const stopAllPolling = () => {
    polls.current.forEach((cancel) => cancel())
    polls.current.clear()
  }
  // 언마운트 때 남은 폴링을 전부 끊는다 — 늦게 온 응답은 cancelled로 버려진다
  useEffect(() => stopAllPolling, [])

  const run = (task: () => Promise<IntonationLearningView>) => {
    setView({ screen: 'loading' })
    task().then(setView, (error: unknown) =>
      setView({ screen: 'error', error: toError(error), retry: () => run(task), fromList: false }),
    )
  }

  /** 코스를 처음부터 — 진입과, 폴링이 무너진 뒤의 [다시 시도] */
  const openCourse = () => {
    stopAllPolling()
    setResults({})
    run(async () => {
      const course = await fetchIntonationCourse(apiBase, courseId, deps)
      recordCard(course, 0) // 카드 진입 = 녹음 화면 자동 호출 (5단계). [다시 시도]도 이 작업을 다시 돌려 1회다
      return { screen: 'card', course, index: 0, revisit: false }
    })
  }

  /*
   * 진입 시 코스 한 번. 개발 빌드 StrictMode는 마운트 effect를 두 번 돌리는데, 코스 조회가 곧 녹음 화면 호출이라 두 번
   * 돌면 네이티브 녹음이 두 번 열린다 — ref로 한 번만 연다(ref는 StrictMode의 재실행 사이에도 남는다)
   */
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    openCourse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * 카드 1건 폴링. 간격·60초 예산은 레벨테스트와 같은 `planNextPoll`이다(서버 pollAfterMs와 백오프의 max, 지터).
   * 혼잡 예산은 안 쓴다 — 학습 응답엔 queue 안내가 없다. 카드마다 따로 돌아 각자 예산을 갖는다.
   * 부를 때마다 예산부터 새로 선다(타임아웃 행의 [다시 시도]).
   *
   * 예산은 조회 응답과 독립된 deadline 타이머로도 건다(KAN-254 리뷰 P1) — planNextPoll은 응답이 와야 판정하므로
   * 요청이 끝나지 않으면 A-4에서 못 나온다. 요청은 끊지 않는다(`request`가 AbortSignal을 받지 않음): 종결 뒤
   * 늦게 온 응답은 cancelled로 버린다. 종결(settle)·취소 모두 같은 cancel을 거쳐 한 번만 끝난다.
   */
  const startPolling = (cardId: string, attemptId: string) => {
    polls.current.get(cardId)?.()
    setResults((r) => ({ ...r, [cardId]: { attemptId, outcome: 'processing' } }))

    const startedAt = Date.now()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let round = 0
    let serverPollAfterMs: number | null = null
    const cancel = () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(deadline)
    }
    const settle = (result: CardResult) => {
      cancel()
      polls.current.delete(cardId)
      setResults((r) => ({ ...r, [cardId]: result }))
    }
    const deadline = setTimeout(() => settle({ attemptId, outcome: 'timeout' }), POLL_BUDGET_MS)
    polls.current.set(cardId, cancel)

    const tick = async () => {
      try {
        const attempt = await fetchIntonationAttempt(apiBase, attemptId, deps)
        if (cancelled) return
        serverPollAfterMs = attempt.pollAfterMs
        const outcome = attemptOutcome(attempt)
        if (outcome.kind === 'completed') {
          const { score, feedback, previousScore } = outcome
          return settle({ attemptId, outcome: 'completed', score, feedback, previousScore })
        }
        if (outcome.kind !== 'processing') return settle({ attemptId, outcome: outcome.kind })
      } catch (error) {
        if (cancelled) return
        // 네트워크·5xx는 한 회차로 세고 계속 돈다. 권한·없는 시도·로그인은 기존 오류 화면의 출구 규칙으로
        const e = toError(error)
        if (!e.retryable) {
          stopAllPolling()
          setView({ screen: 'error', error: e, retry: openCourse, fromList: false })
          return
        }
      }
      const plan = planNextPoll({ round, elapsedMs: Date.now() - startedAt, serverPollAfterMs, retryAfterMs: null })
      if (plan.kind === 'EXHAUSTED') return settle({ attemptId, outcome: 'timeout' })
      round += 1
      timer = setTimeout(() => void tick(), plan.delayMs)
    }
    void tick()
  }

  /*
   * A-2에 있는 동안만 회신을 듣는다. 지금 카드의 회신만 받는다 — 늦게 온 앞 카드 회신이 화면을 넘기지 않게.
   * 회신 = 그 카드 폴링 시작 + 바로 다음 카드 녹음(5단계). 브리지 호출은 setView 갱신 함수 밖, 회신 한 번에 한 번이다
   * (StrictMode가 갱신 함수를 두 번 부른다). 같은 회신이 커밋 전에 또 와도 handled로 한 번만 넘긴다.
   */
  const cardView = view.screen === 'card' ? view : null
  useEffect(() => {
    if (cardView === null) return
    const { course, index, revisit } = cardView
    const card = course.cards[index]
    if (card === undefined) return
    let handled = false
    return installIntonationRecordedReceiver(({ cardId, attemptId }) => {
      if (cardId !== card.cardId || handled) return
      handled = true
      startPolling(cardId, attemptId)
      if (revisit) return setView({ screen: 'detail', course, index, afterRecording: true })
      if (index + 1 < course.cards.length) {
        setView({ screen: 'card', course, index: index + 1, revisit: false })
        recordCard(course, index + 1)
      } else {
        setView({ screen: 'waiting', course })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardView])

  // 마지막 회신 뒤 대기 → 분석 중인 카드가 하나도 없으면 성적표 (소진으로 끝난 카드도 끝난 것이다).
  // KAN-359가 있으면 구간 요약을 받은 뒤 넘어간다 — 「코스 별」 줄이 성적표가 선 뒤에 끼어들어 화면이 밀리지 않게
  useEffect(() => {
    if (view.screen !== 'waiting') return
    if (!view.course.cards.every((c) => results[c.cardId] !== undefined && results[c.cardId].outcome !== 'processing')) return
    const summary: IntonationLearningView = { screen: 'summary', course: view.course }
    if (before?.stars == null) return setView(summary)
    let cancelled = false
    void loadLevels().then((l) => {
      if (cancelled) return
      setLevels(l)
      setView(summary)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, results])

  const openDetail = (index: number) => {
    if (view.screen !== 'summary') return
    setView({ screen: 'detail', course: view.course, index, afterRecording: false })
  }

  /** 성적표로 돌아간다. 다시 녹음으로 코스 별이 바뀌었을 수 있어 구간 요약을 다시 받는다(실패면 앞 값 유지) */
  const backToSummary = () => {
    if (view.screen !== 'detail' && view.screen !== 'card') return
    setView({ screen: 'summary', course: view.course })
    if (before?.stars != null) void loadLevels().then((l) => l !== null && setLevels(l))
  }

  /** 소진 행의 [다시 시도] — 같은 attemptId로 폴링을 다시 세운다. 상세는 결과가 분석 중이라 A-4를 그린다 */
  const retryPolling = () => {
    if (view.screen !== 'detail') return
    const card = view.course.cards[view.index]
    const result = card === undefined ? undefined : results[card.cardId]
    if (card !== undefined && result !== undefined) startPolling(card.cardId, result.attemptId)
  }

  /** 상세의 [다시 시도]·[다시 녹음] — 그 카드만 복귀 모드로 녹음 화면을 1회 연다. card 뷰라야 회신 수신기가 새 attemptId를 받는다 */
  const rerecord = () => {
    if (view.screen !== 'detail') return
    setView({ screen: 'card', course: view.course, index: view.index, revisit: true })
    recordCard(view.course, view.index)
  }

  return { view, results, levels, openDetail, backToSummary, retryPolling, rerecord }
}
