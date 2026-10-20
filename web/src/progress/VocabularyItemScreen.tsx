/**
 * 어휘 문항 화면 (KAN-13).
 *
 * 정의가 준 prompt와 choices를 서버 순서 그대로 그리고, 하나를 골라 [다음]을 누르면
 * 답안을 서버에 제출한 뒤([submitAnswer]) 성공했을 때만 진행 통지([onSubmitted])를 보낸다.
 * 진행을 움직이는 건 호출자(상태 머신)다.
 *
 * 선택지 목록은 `ui/ChoiceList`, 멱등 키 수명 규칙은 `net/useChoiceIdempotencyKey`에 있다
 * (KAN-255 — 단어 학습 치환 문항이 같은 규칙을 재사용한다).
 *
 * **정오 정보는 이 화면 어디에도 없다.** 정의(testDefinition)에 정답 필드 자체가 없어
 * 화면이 실수로도 노출할 수 없다 — 채점은 서버가 하고 점수는 /result에서 한 번에 공개된다.
 */

import { useState } from 'react'
import type { VocabularyItem } from './testDefinition'
import { VocabSubmitError, type VocabSubmitResult } from './submitVocabAnswer'
import { RetestAction } from '../result/RetestAction'
import type { RetestControl } from '../result/useRetest'
import { Button, ChoiceList, StatusBlock } from '../ui'
import { useChoiceIdempotencyKey } from '../net/useChoiceIdempotencyKey'
import { itemCaption } from './itemBadge'
import { isSessionExitCode } from './sessionExit'

export interface VocabularyItemScreenProps {
  item: VocabularyItem
  /**
   * 카드 캡션에 그릴 1-기반 순번. **전체 문항 기준**이다 (음성 문항 화면과 같은 규칙) —
   * 어휘 안에서의 1~5로 부르면 음성과 어휘를 오갈 때 번호가 뒤로 돌아간 것처럼 보인다.
   *
   * 세지 않고 받는 이유는 이 화면이 진행을 모르기 때문이다. 진행을 움직이는 것도, 지금이
   * 몇 번째인지 아는 것도 상태 머신을 든 호출자다.
   */
  itemNumber: number
  totalItems: number
  /** 답안 제출. 결과가 SAVED든 ALREADY_ANSWERED든 "서버에 답이 있다"는 뜻이다 */
  submitAnswer: (choiceId: string, idempotencyKey: string) => Promise<VocabSubmitResult>
  /** 제출이 성공한 뒤의 진행 통지. 진행을 움직이는 건 호출자(상태 머신)다 */
  onSubmitted: () => void
  /** 제출이 세션 만료로 거절됐을 때의 [다시 테스트하기] (KAN-237). 없으면 예전처럼 [다시 시도]가 남는다 */
  retest?: RetestControl
}

export function VocabularyItemScreen({
  item,
  itemNumber,
  totalItems,
  submitAnswer,
  onSubmitted,
  retest,
}: VocabularyItemScreenProps) {
  // 고른 선택지. 제출 중이 아니라면 자유롭게 바꿀 수 있다 — 실패 후에도 바꿔서 다시 낼 수 있다.
  const [selected, setSelected] = useState<string | null>(null)
  // 제출 진행 중 = 화면 잠금. 성공하면 풀지 않는다 — 호출자가 다음 문항으로 넘겨 이 컴포넌트가
  // 내려가므로, 그 사이에 풀면 [다음] 연타가 두 번째 제출을 만들 틈이 생긴다.
  const [submitting, setSubmitting] = useState(false)
  // 직전 제출 실패의 사용자 문구 (서버 봉투의 한국어 message 그대로)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // 직전 실패가 세션 만료·타인 세션인가 (KAN-237). 문구와 같은 자리에서 세우고 지운다
  const [sessionExit, setSessionExit] = useState(false)
  // 답 → 멱등 키. 같은 답 재시도는 같은 키, 답이 바뀌면 새 키 (훅 주석의 수명 규칙)
  const keyForChoice = useChoiceIdempotencyKey()

  const submit = async () => {
    // disabled 가드와 겹치지만 남겨 둔다 — 비동기 제출 도중 들어오는 호출은 disabled로 못 막는다
    if (selected === null || submitting) return

    setSubmitting(true)
    setErrorMessage(null)
    setSessionExit(false)
    // 키 생성까지 try 안이다 — 여기서 동기로 터지면 rejection이 아무 데도 안 잡혀 버튼이
    // "눌러도 아무 일 없는" 상태가 된다 (crypto.randomUUID 부재로 실제 발생했던 증상)
    try {
      await submitAnswer(selected, keyForChoice(selected))
      onSubmitted()
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setSessionExit(error instanceof VocabSubmitError && isSessionExitCode(error.code))
      setSubmitting(false)
    }
  }

  return (
    <>
      {/*
        질문 카드. 음성 문항의 대사 카드와 같은 규격이다(시안) - 두 문항 유형이 번갈아
        나오는데 카드 크기가 다르면 전환마다 화면이 들썩인다.
      */}
      <div className="prompt-card">
        {/* "7 / 10 · 이 말은 무슨 뜻일까요?" — 자리와 할 일을 한 줄로 (아트보드 `Vocab.dc.html`) */}
        <span className="type-caption prompt-card__badge">
          {itemCaption('VOCABULARY', itemNumber, totalItems)}
        </span>
        <h1 id="vocab-prompt" className="type-title">
          {item.prompt}
        </h1>
      </div>

      <ChoiceList
        name="vocab-choice"
        labelledBy="vocab-prompt"
        choices={item.choices}
        selected={selected}
        locked={submitting}
        onSelect={setSelected}
      />

      <div className="item-screen__footer">
        {sessionExit && retest !== undefined ? (
          /*
            세션이 만료된 뒤의 제출 (KAN-237). [다시 시도]는 같은 세션으로 다시 보내 같은 401을
            받을 뿐이라 막다른 길이었다 — 되돌아갈 길이 없는 이 상태에서만 출구를 연다
            (KAN-147 시험 중 이탈 버튼 금지, KAN-191 기준). 보기는 그대로 두되 제출 버튼은 그리지
            않는다. `retest`가 없는 호출자(폴백 없음)는 아래 기존 [다시 시도]를 탄다.

            음성 실패 패널·대기 화면과 같은 벌(StatusBlock)로 맞춘다 — 세 자리의 출구가 다르게
            생기면 안 된다(KAN-191 한 벌 원칙). 처음엔 아래 빨간 <p> + RetestAction으로 그려
            버튼만 왼쪽에 자기 폭으로 붙어 캡처에서 치우쳐 보였다. 문구는 StatusBlock이 실으므로
            이 갈래에서는 <p>를 따로 그리지 않는다 (같은 문구가 두 번 읽히면 안 된다).
          */
          <StatusBlock tone="error" message={errorMessage ?? ''} action={<RetestAction retest={retest} />} />
        ) : (
          <>
            {errorMessage !== null && (
              // 서버 봉투의 한국어 message 그대로. 비난 없는 카피 톤은 봉투(ErrorCode) 쪽 책임이다
              <p
                role="alert"
                className="type-caption"
                style={{
                  color: 'var(--color-destructive-on-surface)',
                  textAlign: 'center',
                  marginBottom: 'var(--space-3)',
                }}
              >
                {errorMessage}
              </p>
            )}
            {/*
              선택 전 비활성이 AC 1항이다. disabled면 onClick이 아예 안 불리므로 selected가 null인
              채로 submit에 닿는 경로가 없다 — 그래도 submit 안의 가드를 남기는 이유는 위 주석 참조.
            */}
            <Button
              disabled={selected === null || submitting}
              onClick={() => void submit()}
              style={{ width: '100%' }}
            >
              {submitting ? '제출 중…' : errorMessage !== null ? '다시 시도' : '다음'}
            </Button>
          </>
        )}
      </div>
    </>
  )
}
