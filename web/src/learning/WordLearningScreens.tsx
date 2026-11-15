/**
 * 단어 학습 화면 W-2~W-5와 라우트 (KAN-255 3단계). W-1 세트 목록은 사투리 여행 지도로 대체됐다 (KAN-347 3단계). 상태와 전환은 [useWordLearning]이 갖고,
 * 여기 화면들은 받은 값을 그리고 버튼을 콜백에 잇기만 한다 — 화면별로 따로 렌더해 시험할 수 있다.
 *
 * 화면 구성은 IxD 초안(ux-ui.md §8.2 KAN-236)과 code wiki 「단어 학습 화면 (KAN-255)」 절을 따른다.
 */

import { useState, type ReactNode } from 'react'
import { Button, ChoiceList, CloseButton, ProgressIndicator, StatusBlock } from '../ui'
import { CheckIcon, ClockIcon, CloudOffIcon, CrossIcon, RefreshIcon, UserIcon } from '../ui/icons'
import { useChoiceIdempotencyKey } from '../net/useChoiceIdempotencyKey'
import { AUTH_GUEST_NOT_ALLOWED, CLIENT_NOT_SIGNED_IN, type WordAnswerResult, type WordApiDeps, type WordAttemptResult, type WordItem, type WordSet } from './wordApi'
import type { StampExits } from './travel'
import { GuestLoginPrompt } from './GuestLoginPrompt'
import { errorExit, useWordLearning, type WordLearningView } from './useWordLearning'

// ── 라우트 ──────────────────────────────────────────────────────────────

export interface WordLearningRouteProps {
  apiBase: string
  /** 스탬프 하나 = 단어 세트 하나. 사투리 여행 지도(`TravelScreens`)가 고른다 (KAN-347 3단계) */
  setId: string
  /**
   * 나가는 길 (KAN-347 3-8). 카드·퀴즈의 ✕, 오류의 [지도로], 완료의 [지도로]가 `toMap`을 부른다 — 학습은 이탈 허용이라
   * 끝까지 가야만 나갈 수 있으면 안 된다 (2026-10-13 사용자 결정, 억양 녹음 ✕와 같은 뜻). `toNextStamp`은 4단계 성적표가 쓴다
   */
  exits: StampExits
  /**
   * 하단 탭 바 (KAN-252). App이 앱 안에서만 넘긴다. 로그인 안내(오류 출구 'leave')에서만 그린다 — 카드·퀴즈·완료처럼
   * 진행 중인 화면에는 탭 바를 두지 않는다(KAN-147). 로그인 안내에서는 이 탭 바가 유일한 출구다
   */
  tabBar?: ReactNode
  /** 테스트 주입용 (fetch·토큰 대체) */
  deps?: WordApiDeps
}

export function WordLearningRoute({ apiBase, setId, exits, tabBar, deps }: WordLearningRouteProps) {
  const learning = useWordLearning(apiBase, setId, deps)
  const { view } = learning

  switch (view.screen) {
    case 'loading':
      return (
        <main className="screen">
          {/* 예외 화면 서식 (KAN-347 1단계, 시안 s-14-learning-loading) */}
          <StatusBlock tone="waiting" icon={<ClockIcon />} message="불러오는 중이에요" detail="잠시만 기다려 주세요" />
        </main>
      )
    case 'error':
      return (
        <>
          <WordErrorScreen view={view} onToMap={exits.toMap} />
          {errorExit(view) === 'leave' && tabBar}
        </>
      )
    case 'cards':
      return (
        <>
          <WordCardScreen set={view.set} index={view.index} onNext={learning.nextCard} onStartQuiz={learning.startQuiz} />
          <CloseButton onClick={exits.toMap} />
        </>
      )
    case 'quiz':
      // 제출 중에 눌러도 그냥 지도로 간다 — 이 라우트가 내려가 늦게 온 응답은 버려진다
      return (
        <>
          <WordQuizScreen
            // 문항이 바뀌면 고른 답·멱등 키·오류 문구를 전부 새로 시작한다
            key={view.set.items[view.index].itemId}
            item={view.set.items[view.index]}
            itemNumber={view.index + 1}
            totalItems={view.set.items.length}
            result={view.result}
            submit={learning.submit}
            onNext={learning.nextItem}
          />
          <CloseButton onClick={exits.toMap} />
        </>
      )
    case 'complete':
      return <WordSetCompleteScreen result={view.result} onToMap={exits.toMap} />
  }
}

// ── 오류 ────────────────────────────────────────────────────────────────

const SIGN_IN_MESSAGE = '로그인하면 단어 학습을 할 수 있어요'

function WordErrorScreen({
  view,
  onToMap,
}: {
  view: Extract<WordLearningView, { screen: 'error' }>
  onToMap: () => void
}) {
  const exit = errorExit(view)
  const message = view.error.code === CLIENT_NOT_SIGNED_IN ? SIGN_IN_MESSAGE : view.error.message
  // 'leave'(로그인 안내)는 버튼이 없다 — 라우트가 탭 바를 출구로 세운다 (KAN-252)
  const action =
    exit === 'leave' ? undefined : exit === 'retry' ? (
      <Button onClick={view.retry}>
        <RefreshIcon />
        다시 시도
      </Button>
    ) : (
      <Button onClick={onToMap}>지도로</Button>
    )
  return (
    <main className="screen">
      {/* 게스트는 오류가 아니라 로그인 안내다 (KAN-330) — 미리 끊었든 서버 403이든 같은 code */}
      {view.error.code === AUTH_GUEST_NOT_ALLOWED ? (
        <GuestLoginPrompt screen />
      ) : (
        // 예외 화면 서식 (KAN-347 1단계): 로그인 안내는 사람(s-20), 그 밖의 오류는 끊긴 구름(s-21)
        <StatusBlock
          tone="error"
          icon={exit === 'leave' ? <UserIcon /> : <CloudOffIcon />}
          message={message}
          action={action}
        />
      )}
    </main>
  )
}

// ── W-2 카드 ─────────────────────────────────────────────────────────────

export function WordCardScreen({
  set,
  index,
  onNext,
  onStartQuiz,
}: {
  set: WordSet
  index: number
  onNext: () => void
  onStartQuiz: () => void
}) {
  const card = set.cards[index]
  const last = index === set.cards.length - 1
  return (
    <main className="item-screen">
      <ProgressIndicator current={index + 1} total={set.cards.length} label="카드 진행률" />
      <div className="prompt-card">
        <span className="type-caption prompt-card__badge">표준어</span>
        <p className="type-title-sm">{card.standard}</p>
        <span className="type-caption prompt-card__badge">사투리</span>
        <h1 className="type-title">{card.dialect}</h1>
      </div>
      <div className="item-screen__footer">
        <Button onClick={last ? onStartQuiz : onNext} style={{ width: '100%' }}>
          {last ? '문제 풀기' : '다음 카드'}
        </Button>
      </div>
    </main>
  )
}

// ── W-3·W-4 문항과 정오 ──────────────────────────────────────────────────

export function WordQuizScreen({
  item,
  itemNumber,
  totalItems,
  result,
  submit,
  onNext,
}: {
  item: WordItem
  itemNumber: number
  totalItems: number
  /** null이면 W-3, 있으면 W-4 */
  result: WordAnswerResult | null
  /** 실패는 던진다 — 문구를 이 화면이 그린다 */
  submit: (choiceId: string, idempotencyKey: string) => Promise<void>
  onNext: () => void
}) {
  // 제출·실패·잠금은 VocabularyItemScreen과 같은 규칙이다 (그쪽 주석이 정본)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const keyForChoice = useChoiceIdempotencyKey()

  const onSubmit = async () => {
    if (selected === null || submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await submit(selected, keyForChoice(selected))
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
    setSubmitting(false)
  }

  const answered = result !== null
  const marks =
    result === null
      ? undefined
      : {
          ...(selected !== null && !result.correct ? { [selected]: 'wrong' as const } : {}),
          [result.correctChoiceId]: 'correct' as const,
        }
  const last = itemNumber === totalItems

  return (
    <main className="item-screen">
      <ProgressIndicator current={itemNumber} total={totalItems} />
      <div className="prompt-card">
        {/* 문항 방향은 서버 prompt 그대로다 (표준어 → 사투리, 보기는 전부 사투리) */}
        <h1 id="word-prompt" className="type-title">
          {item.prompt}
        </h1>
      </div>

      <ChoiceList
        name="word-choice"
        labelledBy="word-prompt"
        choices={item.choices}
        selected={selected}
        locked={submitting || answered}
        onSelect={setSelected}
        marks={marks}
      />

      {result !== null && (
        // 정오는 아이콘 모양(✓·✕) + 글자(「정답」·「오답」)로 읽힌다 — 색은 덧붙일 뿐이다 (NFR-US-03)
        <section className={`word-verdict word-verdict--${result.correct ? 'correct' : 'wrong'}`} role="status">
          <p className="type-title-sm word-verdict__label">
            {result.correct ? <CheckIcon size={24} /> : <CrossIcon size={24} />}
            {result.correct ? '정답' : '오답'}
          </p>
          {!result.correct && <p className="type-body">정답은 {result.correctText}</p>}
          <p className="type-body-sm word-verdict__explanation">{result.explanation}</p>
        </section>
      )}

      <div className="item-screen__footer">
        {answered ? (
          <Button onClick={onNext} style={{ width: '100%' }}>
            {last ? '결과 보기' : '다음 문항'}
          </Button>
        ) : (
          <>
            {errorMessage !== null && (
              <p role="alert" className="type-caption word-inline-error">
                {errorMessage}
              </p>
            )}
            <Button disabled={selected === null || submitting} onClick={() => void onSubmit()} style={{ width: '100%' }}>
              {submitting ? '제출 중…' : errorMessage !== null ? '다시 시도' : '제출'}
            </Button>
          </>
        )}
      </div>
    </main>
  )
}

// ── W-5 세트 완료 ────────────────────────────────────────────────────────

export function WordSetCompleteScreen({ result, onToMap }: { result: WordAttemptResult; onToMap: () => void }) {
  return (
    <main className="item-screen">
      <h1 className="type-title">세트 완료</h1>
      <p className="text-hero">{result.accuracyPercent}%</p>
      <p className="type-body word-complete__count">
        {result.itemCount}문항 중 {result.correctCount}개 맞혔어요
      </p>
      {result.wrongItems.length > 0 && (
        <section aria-labelledby="word-wrong-title" className="word-wrong">
          <h2 id="word-wrong-title" className="type-label">
            틀린 문항
          </h2>
          <p className="type-caption word-wrong__notice">오답이 복습에 쌓였어요</p>
          <ul className="word-wrong__list">
            {result.wrongItems.map((w) => (
              <li key={w.itemId} className="word-wrong__item">
                <p className="type-body">{w.prompt}</p>
                <p className="type-body-sm">내 답: {w.chosenText}</p>
                <p className="type-body-sm">정답: {w.correctText}</p>
                <p className="type-caption word-wrong__explanation">{w.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="item-screen__footer">
        {/* 성적표 개편([다음 스탬프]·글자 버튼 「지도로」)은 4단계 몫이다 — 3단계는 목적지만 지도로 바꿨다 (3-8) */}
        <Button onClick={onToMap} style={{ width: '100%' }}>
          지도로
        </Button>
      </div>
    </main>
  )
}
