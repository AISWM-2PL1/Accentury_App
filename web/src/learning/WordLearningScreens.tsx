/**
 * 단어 스탬프 화면과 라우트 (KAN-255 3단계 → KAN-347 4단계). 카드(s-12) → 문항(s-13, 5초 제한) → 피드백(s-14) → 성적표(s-15-A).
 * W-1 세트 목록은 사투리 여행 지도로 대체됐다 (KAN-347 3단계). 상태와 전환은 [useWordLearning]이 갖고,
 * 여기 화면들은 받은 값을 그리고 버튼을 콜백에 잇기만 한다 — 화면별로 따로 렌더해 시험할 수 있다.
 *
 * 화면 구성은 code wiki 「단어 학습 화면」 절과 시안 파일(px·색·문구 정본)을 따른다.
 */

import { useState, type ReactNode } from 'react'
import { Button, ChoiceList, CloseButton, ProgressIndicator, StatusBlock } from '../ui'
import { ArrowRightIcon, CheckIcon, CheckLineIcon, ClockIcon, CloudOffIcon, CrossIcon, RefreshIcon, UserIcon } from '../ui/icons'
import { useChoiceIdempotencyKey } from '../net/useChoiceIdempotencyKey'
import { AUTH_GUEST_NOT_ALLOWED, CLIENT_NOT_SIGNED_IN, type WordAnswerResult, type WordApiDeps, type WordAttemptResult, type WordItem, type WordSet } from './wordApi'
import type { CourseStarsChange, StampExits } from './travel'
import { stampName, type Stamp } from './stampNaming'
import { StampDoneBadge, StampReward } from './StampReward'
import { GuestLoginPrompt } from './GuestLoginPrompt'
import { errorExit, useWordLearning, type WordLearningView } from './useWordLearning'
import { WORD_TIME_LIMIT_MS, WORD_TIME_WARNING_MS, useWordCountdown } from './wordTimer'

// ── 라우트 ──────────────────────────────────────────────────────────────

export interface WordLearningRouteProps {
  apiBase: string
  /** 스탬프 하나 = 단어 세트 하나(`stamp.id`). 사투리 여행 지도(`TravelScreens`)가 고른다. 성적표 제목 「단어 학습 n 결과」에 쓴다 */
  stamp: Stamp
  /** 들어가기 전 이 코스의 별 (`TravelCourse.stars`). KAN-359 전이면 null — 성적표 「코스 별」 줄을 숨긴다 */
  courseStars: { collected: number; required: number } | null
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
  /** 문항 제한 시간(ms), null이면 끔. 기본은 5초(늘 켜짐, KAN-361). 테스트가 갈아 끼운다 */
  timeLimitMs?: number | null
}

export function WordLearningRoute({
  apiBase,
  stamp,
  courseStars,
  exits,
  tabBar,
  deps,
  timeLimitMs = WORD_TIME_LIMIT_MS,
}: WordLearningRouteProps) {
  const learning = useWordLearning(apiBase, stamp.id, deps, { course: stamp.course, stars: courseStars })
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
            timeLimitMs={timeLimitMs}
          />
          <CloseButton onClick={exits.toMap} />
        </>
      )
    case 'complete':
      return (
        <WordReportScreen
          set={view.set}
          result={view.result}
          course={view.course}
          n={stamp.n}
          onNextStamp={exits.toNextStamp}
          onToMap={exits.toMap}
        />
      )
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

// ── 카드 (s-12) ──────────────────────────────────────────────────────────

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
      <ProgressIndicator current={index + 1} total={set.cards.length} label="단어" />
      <div className="prompt-card">
        <span className="type-caption prompt-card__badge">표준어</span>
        <p className="type-title-sm">{card.standard}</p>
        <span className="type-caption prompt-card__badge">사투리</span>
        <h1 className="type-title">{card.dialect}</h1>
      </div>
      <div className="item-screen__footer">
        <Button onClick={last ? onStartQuiz : onNext} style={{ width: '100%' }}>
          {last ? (
            '문제 풀기'
          ) : (
            <>
              다음 카드
              <ArrowRightIcon />
            </>
          )}
        </Button>
      </div>
    </main>
  )
}

// ── 문항(s-13)과 피드백(s-14) ─────────────────────────────────────────────

/**
 * 서버 prompt의 따옴표를 「」로 (4-2 「서버 `prompt` 그대로, 따옴표는 「」」). 서버는 「'부추'를 경남 사투리로 무엇이라 할까요?」처럼
 * 앞머리 낱말을 작은따옴표로 감싼다 — 그 첫 짝만 바꾸고 나머지 글자는 그대로 둔다. 해설(`explanation`)은 바꾸지 않는다(4-3)
 */
export function quotePrompt(prompt: string): string {
  return prompt.replace(/^'([^']+)'/, '「$1」')
}

/** 시간 초과 답안의 멱등 키 자리 — 보기 id와 겹치지 않는 값이면 된다. 보기를 고른 답과는 다른 키다(KAN-360 「다른 답」) */
const TIMED_OUT_KEY = ':timed-out'

export function WordQuizScreen({
  item,
  itemNumber,
  totalItems,
  result,
  submit,
  onNext,
  timeLimitMs = null,
}: {
  item: WordItem
  itemNumber: number
  totalItems: number
  /** null이면 문항, 있으면 피드백 */
  result: WordAnswerResult | null
  /** 실패는 던진다 — 문구를 이 화면이 그린다. choiceId null = 시간 초과 */
  submit: (choiceId: string | null, idempotencyKey: string) => Promise<void>
  onNext: () => void
  /** 제한 시간(ms). null이면 막대가 없다 (4-5 설정값) */
  timeLimitMs?: number | null
}) {
  // 제출·실패·잠금은 VocabularyItemScreen과 같은 규칙이다 (그쪽 주석이 정본)
  const [selected, setSelected] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const keyForChoice = useChoiceIdempotencyKey()
  const answered = result !== null

  const send = async (choiceId: string | null) => {
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await submit(choiceId, keyForChoice(choiceId ?? TIMED_OUT_KEY))
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
    setSubmitting(false)
  }

  // 답을 고르면 멈춘다(제출 전 변경 가능). 5초가 끝나면 고르지 않은 채 오답으로 낸다 (확정된 결정 2026-11-15)
  const left = useWordCountdown(timeLimitMs, selected !== null || timedOut || answered, () => {
    setTimedOut(true)
    void send(null)
  })

  const marks =
    result === null
      ? undefined
      : {
          ...(selected !== null && !timedOut && !result.correct ? { [selected]: 'wrong' as const } : {}),
          [result.correctChoiceId]: 'correct' as const,
        }
  const last = itemNumber === totalItems
  const seconds = left === null ? 0 : Math.ceil(left / 1000)

  return (
    <main className="item-screen word-quiz">
      <ProgressIndicator current={itemNumber} total={totalItems} label="단어" />
      {left !== null && timeLimitMs !== null && (
        // 타일 11: 4px 알약이 linear로 줄고 마지막 1초는 벽돌색 + 흔들림(동작 줄이기면 흔들림만 빠진다 — 시간 정보라 막대는 남긴다)
        <div
          className={left <= WORD_TIME_WARNING_MS ? 'word-timer word-timer--warning' : 'word-timer'}
          role="timer"
          aria-label={`남은 시간 ${seconds}초`}
        >
          <div className="word-timer__track">
            <span className="word-timer__fill" style={{ transform: `scaleX(${left / timeLimitMs})` }} />
          </div>
          <span className="word-timer__number" aria-hidden="true">
            {seconds}
          </span>
        </div>
      )}
      <div className="prompt-card">
        {/* 문항 방향은 서버 prompt 그대로다 (표준어 → 사투리, 보기는 전부 사투리) */}
        <h1 id="word-prompt" className="type-title">
          {quotePrompt(item.prompt)}
        </h1>
      </div>

      <ChoiceList
        name="word-choice"
        labelledBy="word-prompt"
        choices={item.choices}
        selected={selected}
        locked={submitting || answered || timedOut}
        onSelect={setSelected}
        marks={marks}
      />

      {result !== null && (
        // 정오는 아이콘 모양(✓·✕·시계) + 글자로 읽힌다 — 색은 덧붙일 뿐이다 (NFR-US-03)
        <section className={`word-verdict word-verdict--${result.correct ? 'correct' : 'wrong'}`} role="status">
          <p className="type-title-sm word-verdict__label">
            {timedOut ? <ClockIcon size={24} /> : result.correct ? <CheckIcon size={24} /> : <CrossIcon size={24} />}
            {timedOut ? '시간이 다 됐어요' : result.correct ? '정답' : '오답'}
          </p>
          <p className="type-body-sm word-verdict__explanation">{result.explanation}</p>
        </section>
      )}

      <div className="item-screen__footer">
        {answered ? (
          <Button onClick={onNext} style={{ width: '100%' }}>
            {last ? (
              '결과 보기'
            ) : (
              <>
                다음 문항
                <ArrowRightIcon />
              </>
            )}
          </Button>
        ) : (
          <>
            {errorMessage !== null && (
              <p role="alert" className="type-caption word-inline-error">
                {errorMessage}
              </p>
            )}
            <Button
              disabled={(selected === null && !timedOut) || submitting}
              onClick={() => void send(timedOut ? null : selected)}
              style={{ width: '100%' }}
            >
              {submitting ? (
                '제출 중…'
              ) : errorMessage !== null ? (
                '다시 시도'
              ) : (
                <>
                  <CheckLineIcon />
                  제출
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </main>
  )
}

// ── 성적표 (s-15-A) ──────────────────────────────────────────────────────

/**
 * 단어 성적표. 점수 원은 완료 응답의 정답률, 별은 같은 응답의 이번 시도 `stars`(KAN-359)다. `stars`가 없으면 별과 「코스 별」 줄을
 * 숨긴다(4-5). 행은 세트 문항 전체 — 완료 응답은 틀린 문항(`wrongItems`)만 주므로 세트 문항 목록에 겹쳐 맞힌 행을 채운다.
 */
export function WordReportScreen({
  set,
  result,
  course,
  n,
  onNextStamp,
  onToMap,
}: {
  set: WordSet
  result: WordAttemptResult
  course: CourseStarsChange | null
  /** 「단어 학습 n」의 n */
  n: number
  onNextStamp: () => void
  onToMap: () => void
}) {
  const wrongById = new Map(result.wrongItems.map((w) => [w.itemId, w]))
  const standardByCard = new Map(set.cards.map((c) => [c.cardId, c.standard]))
  return (
    <>
      <main className="item-screen word-report">
        <h1 className="type-title">{stampName('word', n)} 결과</h1>
        <StampReward
          score={result.accuracyPercent}
          stars={result.stars ?? null}
          course={result.stars === undefined ? null : course}
        />
        <section aria-labelledby="word-report-title" className="word-report__items">
          <div className="word-report__head">
            <h2 id="word-report-title" className="type-title-sm">
              문항별 결과
            </h2>
            <span className="type-caption word-report__summary">
              {result.correctCount} / {result.itemCount} 정답 · 정답률 {result.accuracyPercent}%
            </span>
          </div>
          <ul className="word-report__list">
            {set.items.map((item) => {
              const wrong = wrongById.get(item.itemId)
              const word = standardByCard.get(item.cardId) ?? item.prompt
              if (wrong === undefined) {
                return (
                  <li key={item.itemId} className="word-report__row">
                    <div className="word-report__row-top">
                      <span className="word-report__word">{word}</span>
                      <span className="type-caption word-report__mark">
                        <CheckIcon />
                        정답
                      </span>
                    </div>
                  </li>
                )
              }
              return (
                <li key={item.itemId} className="word-report__row word-report__row--wrong">
                  {/* 틀린 행은 눌러 펼친다 — 접힘·펼침과 키보드 조작은 브라우저의 details가 준다 */}
                  <details>
                    <summary className="word-report__row-top">
                      <span className="word-report__word">{word}</span>
                      <span className="type-caption word-report__mark">
                        <CrossIcon />
                        오답
                      </span>
                    </summary>
                    <p className="type-caption word-report__answer">
                      {/* 시간 초과는 고른 보기가 없다(null) — 「내 답」 자리에 빈칸 대신 「시간 초과」 (KAN-360) */}
                      {wrong.timedOut === true || wrong.chosenText === null ? (
                        <span>시간 초과</span>
                      ) : (
                        <span>
                          내 답 <s>{wrong.chosenText}</s>
                        </span>
                      )}
                      <span aria-hidden="true" className="word-report__arrow">
                        <ArrowRightIcon size={16} />
                      </span>
                      <span className="sr-only">정답</span>
                      <span className="word-report__correct">{wrong.correctText}</span>
                    </p>
                    <p className="type-caption word-report__explanation">{wrong.explanation}</p>
                  </details>
                </li>
              )
            })}
          </ul>
        </section>
        <div className="item-screen__footer word-report__footer">
          <Button onClick={onNextStamp} style={{ width: '100%' }}>
            다음 스탬프
            <ArrowRightIcon />
          </Button>
          <Button variant="text" onClick={onToMap} style={{ width: '100%' }}>
            지도로
          </Button>
        </div>
      </main>
      <StampDoneBadge />
    </>
  )
}
