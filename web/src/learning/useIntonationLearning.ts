/**
 * 억양 학습 A-1·A-2(+ A-3 회신 자리)의 상태 (KAN-253 1단계). 구조는 [useWordLearning]의 거울이다 —
 * `?screen=intonation` 한 문서 안에서 `view`만 바꾸고, 실패는 `{ screen: 'error' }` 하나로 모아
 * 출구를 `errorExit`(단어 학습과 같은 함수)이 code로 가른다. 이탈은 시스템 뒤로가기만(2026-10-12 착수 결정).
 *
 * 녹음은 네이티브가 화면·업로드까지 끝내고 성공한 경우에만 `onIntonationRecorded`로 회신한다.
 * 회신이 오면 'submitted'(분석 중 자리 표시)로 간다 — 결과 폴링·A-4 본 화면은 KAN-254다.
 * 회신이 없으면(업로드 전 뒤로가기) A-2 그대로다.
 *
 * 5단계(2026-10-12 사용자 결정): 카드에 들어서는 순간(코스 상세 로드 성공, [다음 카드]) 녹음 화면을
 * 자동으로 한 번 연다 — 녹음 대기 화면이 카드 n/N·대사·곡선을 다 보여 A-2와 중복이었다. 그래서 A-2는
 * 녹음 화면을 뒤로가기로 닫았을 때 드러나는 일시정지 화면이다. 호출은 effect가 아니라 그 전이를 만든
 * 비동기 작업·클릭 핸들러 안에서 한다 — StrictMode가 effect를 두 번 돌려도 두 번 열리지 않게.
 */

import { useEffect, useState } from 'react'
import { installIntonationRecordedReceiver, startIntonationRecording } from '../bridge/bridge'
import type { WordApiDeps } from './wordApi'
import { WordLearningError } from './wordApi'
import {
  fetchIntonationCourse,
  fetchIntonationCourses,
  type IntonationCourse,
  type IntonationCourseSummary,
} from './intonationApi'

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
  /** 업로드 접수됨 — attemptId는 KAN-254 폴링이 쓸 키다 */
  | { screen: 'submitted'; course: IntonationCourse; index: number; attemptId: string }
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
      setView((v) => (v.screen === 'card' ? { screen: 'submitted', course: v.course, index: v.index, attemptId } : v))
    })
  }, [listeningCardId])

  /**
   * 자리 표시의 [다음 카드] — 마지막 카드에서는 화면이 [코스 목록으로]를 대신 그린다.
   * setView 갱신 함수는 StrictMode가 두 번 부르므로 브리지 호출은 그 밖, 클릭 한 번에 한 번만 둔다
   */
  const nextCard = () => {
    if (view.screen !== 'submitted' || view.index + 1 >= view.course.cards.length) return
    const index = view.index + 1
    setView({ screen: 'card', course: view.course, index })
    recordCard(view.course, index)
  }

  return { view, backToList, openCourse, nextCard }
}
