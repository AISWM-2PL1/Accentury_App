/**
 * 단어 학습 W-1~W-5의 상태 (KAN-255 3단계).
 *
 * ## 한 문서 안의 상태 전환
 *
 * 레벨테스트는 화면마다 진입 쿼리를 바꿔 문서를 다시 로드하지만(`goToResult`), 단어 학습은
 * `?screen=words` 하나로 들어와 이 훅의 `view`만 바꾼다. 세트·시도 id가 메모리에 있어야 다음
 * 요청을 보낼 수 있고, 학습은 이탈 허용(IxD §8.3 초안)이라 중간 상태를 URL로 복원할 이유가 없다.
 *
 * ## 실패의 출구는 화면이 아니라 여기서 정한다
 *
 * 실패는 전부 `{ screen: 'error' }`로 모이고 [다시 시도]가 다시 부를 작업(`retry`)을 함께 싣는다.
 * 버튼을 무엇으로 그릴지는 [errorExit]가 code로 가른다 — 같은 code가 단계마다 다르게 처리되면
 * 안 된다(로그인 없음은 어느 단계에서 나와도 같은 안내).
 *
 * 답안 제출만 예외다: 실패해도 W-3에 남아 답과 멱등 키를 유지한다(VocabularyItemScreen 규칙).
 * 로그인·시도 자체가 무너진 code만 error 화면으로 보낸다 — 그 자리에서 다시 내도 같은 실패다.
 */

import { useEffect, useState } from 'react'
import { haptic } from '../bridge/bridge'
import {
  CLIENT_NOT_SIGNED_IN,
  UNAUTHENTICATED,
  WordLearningError,
  completeWordAttempt,
  fetchWordSet,
  fetchWordSets,
  startWordAttempt,
  submitWordAnswer,
  type WordAnswerResult,
  type WordApiDeps,
  type WordAttemptResult,
  type WordSet,
  type WordSetSummary,
} from './wordApi'

export type WordLearningView =
  | { screen: 'loading' }
  | { screen: 'list'; sets: WordSetSummary[] }
  | { screen: 'cards'; set: WordSet; index: number }
  /** result가 null이면 W-3(답 고르기), 있으면 W-4(정오·해설)다 */
  | { screen: 'quiz'; set: WordSet; attemptId: string; index: number; result: WordAnswerResult | null }
  | { screen: 'complete'; result: WordAttemptResult }
  /** fromList: 목록 조회 실패 — 돌아갈 목록이 없으니 재시도 불가여도 [다시 시도]다 */
  | { screen: 'error'; error: WordLearningError; retry: () => void; fromList: boolean }

/** 오류 화면의 출구. 'leave' = [학습 종류로], 'retry' = [다시 시도], 'list' = [세트 목록으로] */
export type ErrorExit = 'leave' | 'retry' | 'list'

export function isSignInCode(code: string | null): boolean {
  return code === CLIENT_NOT_SIGNED_IN || code === UNAUTHENTICATED
}

export function errorExit(view: { error: WordLearningError; fromList: boolean }): ErrorExit {
  if (isSignInCode(view.error.code)) return 'leave'
  if (view.fromList || view.error.retryable) return 'retry'
  return 'list'
}

function toError(error: unknown): WordLearningError {
  if (error instanceof WordLearningError) return error
  return new WordLearningError(error instanceof Error ? error.message : String(error), null, true)
}

export function useWordLearning(apiBase: string, deps: WordApiDeps = {}) {
  const [view, setView] = useState<WordLearningView>({ screen: 'loading' })

  const run = (task: () => Promise<WordLearningView>, fromList = false) => {
    setView({ screen: 'loading' })
    task().then(setView, (error: unknown) =>
      setView({ screen: 'error', error: toError(error), retry: () => run(task, fromList), fromList }),
    )
  }

  const backToList = () =>
    run(async () => ({ screen: 'list', sets: (await fetchWordSets(apiBase, deps)).sets }), true)

  // 진입 시 목록 한 번. 개발 빌드 StrictMode의 이중 실행은 조회 두 번일 뿐이라 막지 않는다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(backToList, [])

  const openSet = (setId: string) =>
    run(async () => ({ screen: 'cards', set: await fetchWordSet(apiBase, setId, deps), index: 0 }))

  const nextCard = () =>
    setView((v) => (v.screen === 'cards' ? { ...v, index: Math.min(v.index + 1, v.set.cards.length - 1) } : v))

  /** W-2 마지막 카드의 [문제 풀기] — 시도를 시작해 W-3 첫 문항으로 */
  const startQuiz = () => {
    if (view.screen !== 'cards') return
    const set = view.set
    run(async () => {
      const attempt = await startWordAttempt(apiBase, set.setId, deps)
      return { screen: 'quiz', set, attemptId: attempt.attemptId, index: 0, result: null }
    })
  }

  /**
   * W-3 제출. 성공하면 W-4로 멈춘다(다음 문항으로 넘기지 않는다). 실패는 던져서 화면이 문구를
   * 그리게 한다 — 단, 로그인·시도가 무너진 code는 error 화면으로 보낸다(머리 주석).
   */
  const submit = async (choiceId: string, idempotencyKey: string): Promise<void> => {
    if (view.screen !== 'quiz') return
    const { attemptId, index, set } = view
    try {
      const result = await submitWordAnswer(
        apiBase,
        { attemptId, itemId: set.items[index].itemId, choiceId, idempotencyKey },
        deps,
      )
      // 정오가 정해지는 순간 한 번 (KAN-258 — 결과가 정해지는 순간의 success·error)
      haptic(result.correct ? 'success' : 'error')
      setView((v) => (v.screen === 'quiz' && v.index === index ? { ...v, result } : v))
    } catch (error: unknown) {
      const e = toError(error)
      if (isSignInCode(e.code) || (e.code ?? '').startsWith('LEARNING_ATTEMPT_')) {
        setView({ screen: 'error', error: e, retry: backToList, fromList: false })
        return
      }
      throw e
    }
  }

  /** W-4의 [다음 문항] / 마지막 문항이면 [결과 보기] → 완료 요청 → W-5 */
  const nextItem = () => {
    if (view.screen !== 'quiz') return
    if (view.index + 1 < view.set.items.length) {
      setView({ ...view, index: view.index + 1, result: null })
      return
    }
    const attemptId = view.attemptId
    run(async () => ({ screen: 'complete', result: await completeWordAttempt(apiBase, attemptId, deps) }))
  }

  return { view, backToList, openSet, nextCard, startQuiz, submit, nextItem }
}

export type WordLearning = ReturnType<typeof useWordLearning>
