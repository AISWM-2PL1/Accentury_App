/**
 * 단어 학습 화면 W-1~W-5와 라우트 (KAN-255 3단계). 상태와 전환은 [useWordLearning]이 갖고,
 * 여기 화면들은 받은 값을 그리고 버튼을 콜백에 잇기만 한다 — 화면별로 따로 렌더해 시험할 수 있다.
 *
 * 화면 구성은 IxD 초안(ux-ui.md §8.2 KAN-236)과 code wiki 「단어 학습 화면 (KAN-255)」 절을 따른다.
 */

import { useState } from 'react'
import { Button, ChoiceList, ProgressIndicator, StatusBlock } from '../ui'
import { CheckIcon, CrossIcon } from '../ui/icons'
import { useChoiceIdempotencyKey } from '../net/useChoiceIdempotencyKey'
import { CLIENT_NOT_SIGNED_IN, type WordAnswerResult, type WordApiDeps, type WordAttemptResult, type WordItem, type WordSet, type WordSetSummary } from './wordApi'
import { errorExit, useWordLearning, type WordLearningView } from './useWordLearning'

// ── 라우트 ──────────────────────────────────────────────────────────────

export interface WordLearningRouteProps {
  apiBase: string
  /** [학습 종류로]. ponytail: L-1(학습 종류 선택)이 아직 없어 App이 인트로로 보낸다 — L-1 생기면 교체 */
  onLeave: () => void
  /** 테스트 주입용 (fetch·토큰 대체) */
  deps?: WordApiDeps
}

export function WordLearningRoute({ apiBase, onLeave, deps }: WordLearningRouteProps) {
  const learning = useWordLearning(apiBase, deps)
  const { view } = learning

  switch (view.screen) {
    case 'loading':
      return (
        <main className="screen">
          <StatusBlock tone="waiting" message="불러오는 중이에요" />
        </main>
      )
    case 'error':
      return <WordErrorScreen view={view} onLeave={onLeave} onBackToList={learning.backToList} />
    case 'list':
      return <WordSetListScreen sets={view.sets} onOpen={learning.openSet} onLeave={onLeave} />
    case 'cards':
      return (
        <WordCardScreen set={view.set} index={view.index} onNext={learning.nextCard} onStartQuiz={learning.startQuiz} />
      )
    case 'quiz':
      return (
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
      )
    case 'complete':
      return <WordSetCompleteScreen result={view.result} onBackToList={learning.backToList} />
  }
}

// ── 오류 ────────────────────────────────────────────────────────────────

const SIGN_IN_MESSAGE = '로그인하면 단어 학습을 할 수 있어요'

function WordErrorScreen({
  view,
  onLeave,
  onBackToList,
}: {
  view: Extract<WordLearningView, { screen: 'error' }>
  onLeave: () => void
  onBackToList: () => void
}) {
  const exit = errorExit(view)
  const message = view.error.code === CLIENT_NOT_SIGNED_IN ? SIGN_IN_MESSAGE : view.error.message
  const action =
    exit === 'leave' ? (
      <Button onClick={onLeave}>학습 종류로</Button>
    ) : exit === 'retry' ? (
      <Button onClick={view.retry}>다시 시도</Button>
    ) : (
      <Button onClick={onBackToList}>세트 목록으로</Button>
    )
  return (
    <main className="screen">
      <StatusBlock tone="error" message={message} action={action} />
    </main>
  )
}

// ── W-1 세트 목록 ────────────────────────────────────────────────────────

export function WordSetListScreen({
  sets,
  onOpen,
  onLeave,
}: {
  sets: WordSetSummary[]
  onOpen: (setId: string) => void
  onLeave: () => void
}) {
  if (sets.length === 0) {
    // 막다른 곳엔 유일한 버튼 (IxD §8.3, KAN-191)
    return (
      <main className="screen">
        <StatusBlock tone="waiting" message="아직 준비 중인 세트예요" action={<Button onClick={onLeave}>학습 종류로</Button>} />
      </main>
    )
  }

  // 서버가 seq 오름차순으로 주므로 레벨 묶음도 처음 나온 순서를 따른다 (Map은 삽입 순서를 지킨다)
  const byLevel = new Map<number, WordSetSummary[]>()
  for (const set of sets) byLevel.set(set.level, [...(byLevel.get(set.level) ?? []), set])
  // ponytail: 서버에 추천 필드가 아직 없어 첫 세트(seq 최소)를 추천으로 둔다 — KAN-268 추천 필드가 오면 교체
  const recommendedId = sets[0].setId

  return (
    <main className="item-screen">
      <h1 className="type-title">단어 학습</h1>
      {[...byLevel].map(([level, levelSets]) => (
        <section key={level} className="word-level" aria-labelledby={`word-level-${level}`}>
          <h2 id={`word-level-${level}`} className="type-label word-level__title">
            레벨 {level}
          </h2>
          {levelSets.map((set) => {
            const recommended = set.setId === recommendedId
            return (
              // 행은 button이다 — 키보드 포커스와 스크린 리더의 "버튼" 안내를 브라우저가 준다
              <button
                key={set.setId}
                type="button"
                className={`word-set-row${recommended ? ' word-set-row--recommended' : ''}`}
                onClick={() => onOpen(set.setId)}
              >
                <span className="type-body word-set-row__title">{set.title}</span>
                <span className="type-caption word-set-row__meta">
                  {recommended && <span className="word-set-row__badge">추천</span>}
                  카드 {set.cardCount}장
                </span>
              </button>
            )
          })}
        </section>
      ))}
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

export function WordSetCompleteScreen({ result, onBackToList }: { result: WordAttemptResult; onBackToList: () => void }) {
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
        <Button onClick={onBackToList} style={{ width: '100%' }}>
          세트 목록으로
        </Button>
      </div>
    </main>
  )
}
