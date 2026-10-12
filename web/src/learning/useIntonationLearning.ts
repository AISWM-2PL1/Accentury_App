/**
 * 억양 학습 A-1·A-2(+ A-3 회신 자리)의 상태 (KAN-253 1단계). 구조는 [useWordLearning]의 거울이다 —
 * `?screen=intonation` 한 문서 안에서 `view`만 바꾸고, 실패는 `{ screen: 'error' }` 하나로 모아
 * 출구를 `errorExit`(단어 학습과 같은 함수)이 code로 가른다. 이탈은 시스템 뒤로가기만(2026-10-12 착수 결정).
 *
 * 녹음은 네이티브가 화면·업로드까지 끝내고 성공한 경우에만 `onIntonationRecorded`로 회신한다.
 * 회신이 오면 'submitted'(분석 중 자리 표시)로 간다 — 결과 폴링·A-4 본 화면은 KAN-254다.
 * 회신이 없으면(업로드 전 뒤로가기) A-2 그대로다.
 */

import { useEffect, useState } from 'react'
import { installIntonationRecordedReceiver } from '../bridge/bridge'
import type { WordApiDeps } from './wordApi'
import { WordLearningError } from './wordApi'
import {
  fetchIntonationCourse,
  fetchIntonationCourses,
  type IntonationCourse,
  type IntonationCourseSummary,
} from './intonationApi'

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
    run(async () => ({ screen: 'card', course: await fetchIntonationCourse(apiBase, courseId, deps), index: 0 }))

  // A-2에 있는 동안만 회신을 듣는다. 지금 카드의 회신만 받는다 — 늦게 온 앞 카드 회신이 화면을 넘기지 않게
  const listeningCardId = view.screen === 'card' ? view.course.cards[view.index]?.cardId : undefined
  useEffect(() => {
    if (listeningCardId === undefined) return
    return installIntonationRecordedReceiver(({ cardId, attemptId }) => {
      if (cardId !== listeningCardId) return
      setView((v) => (v.screen === 'card' ? { screen: 'submitted', course: v.course, index: v.index, attemptId } : v))
    })
  }, [listeningCardId])

  /** 자리 표시의 [다음 카드] — 마지막 카드에서는 화면이 [코스 목록으로]를 대신 그린다 */
  const nextCard = () =>
    setView((v) =>
      v.screen === 'submitted' && v.index + 1 < v.course.cards.length
        ? { screen: 'card', course: v.course, index: v.index + 1 }
        : v,
    )

  return { view, backToList, openCourse, nextCard }
}
