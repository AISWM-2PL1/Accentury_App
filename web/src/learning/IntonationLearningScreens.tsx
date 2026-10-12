/**
 * 억양 학습 화면 A-1(코스 목록)·A-2(대사 카드)·A-4(분석 대기·실패 출구, KAN-254 2단계)·A-5(피드백, 3단계)·결과 목록(A-6 자리, 5단계)와 라우트 (KAN-253 1단계). 상태는 [useIntonationLearning]이
 * 갖고 여기 화면들은 그리고 버튼을 잇기만 한다 — `WordLearningScreens.tsx`와 같은 나눔이다.
 *
 * 화면 규칙은 code wiki ux-ui.md 「억양 학습 화면 (KAN-253)」·「억양 학습 피드백 (KAN-254)」 절, 녹음 계약은 webview-bridge.md §12.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { canStartIntonationRecording } from '../bridge/bridge'
import { guideCurveDisplayPoints } from '../recording/guideCurve'
import { CurveLane } from '../recording/CurveLane'
import { Button, ProgressIndicator, StatusBlock } from '../ui'
import { CheckSmallIcon } from '../ui/icons'
import { TextHero } from '../ui/TextHero'
import { CLIENT_NOT_SIGNED_IN, type WordApiDeps } from './wordApi'
import type { IntonationCourse, IntonationCourseSummary, PitchFeedbackItem } from './intonationApi'
import { errorExit } from './useWordLearning'
import { recordCard, useIntonationLearning, type CardResult, type IntonationLearningView } from './useIntonationLearning'
import { SLOW_NOTICE_MS, WAITING_STAGES, waitingStage } from './intonationWaiting'
import { feedbackComment, formatDelta, scoreDelta, syllableMarks, type SyllableMark } from './intonationFeedback'

// ── 라우트 ──────────────────────────────────────────────────────────────

export interface IntonationLearningRouteProps {
  apiBase: string
  /** [학습 종류로]. ponytail: L-1(학습 종류 선택)이 아직 없어 App이 인트로로 보낸다 — L-1 생기면 교체 */
  onLeave: () => void
  /** 테스트 주입용 (fetch·토큰 대체) */
  deps?: WordApiDeps
}

export function IntonationLearningRoute({ apiBase, onLeave, deps }: IntonationLearningRouteProps) {
  const learning = useIntonationLearning(apiBase, deps)
  const { view } = learning

  switch (view.screen) {
    case 'loading':
      return (
        <main className="screen">
          <StatusBlock tone="waiting" message="불러오는 중이에요" />
        </main>
      )
    case 'error':
      return <IntonationErrorScreen view={view} onLeave={onLeave} onBackToList={learning.backToList} />
    case 'list':
      return <IntonationCourseListScreen courses={view.courses} onOpen={learning.openCourse} onLeave={onLeave} />
    case 'card':
      return (
        <IntonationCardScreen
          key={view.index}
          course={view.course}
          index={view.index}
          onBackToList={view.revisit ? learning.backToSummary : learning.backToList}
          backLabel={view.revisit ? '결과 목록으로' : '코스 목록으로'}
        />
      )
    case 'waiting':
      return <IntonationWaitingScreen />
    case 'summary':
      return (
        <IntonationSummaryScreen
          course={view.course}
          results={learning.results}
          onOpen={learning.openDetail}
          onBackToList={learning.backToList}
        />
      )
    case 'detail': {
      const result = learning.results[view.course.cards[view.index]?.cardId ?? '']
      if (result === undefined) return null // 회신이 온 카드만 목록 행이 된다
      if (result.outcome === 'processing') return <IntonationWaitingScreen key={result.attemptId} />
      if (result.outcome === 'completed') {
        return (
          <IntonationFeedbackScreen
            course={view.course}
            index={view.index}
            result={result}
            onBackToSummary={learning.backToSummary}
            onRetry={learning.rerecord}
          />
        )
      }
      return (
        <IntonationRetryScreen
          course={view.course}
          index={view.index}
          reason={result.outcome}
          onRetry={learning.retryPolling}
          onRerecord={learning.rerecord}
          onBackToSummary={learning.backToSummary}
        />
      )
    }
  }
}

// ── 오류 ────────────────────────────────────────────────────────────────

const SIGN_IN_MESSAGE = '로그인하면 억양 학습을 할 수 있어요'

function IntonationErrorScreen({
  view,
  onLeave,
  onBackToList,
}: {
  view: Extract<IntonationLearningView, { screen: 'error' }>
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
      <Button onClick={onBackToList}>코스 목록으로</Button>
    )
  return (
    <main className="screen">
      <StatusBlock tone="error" message={message} action={action} />
    </main>
  )
}

// ── A-1 코스 목록 ────────────────────────────────────────────────────────

export function IntonationCourseListScreen({
  courses,
  onOpen,
  onLeave,
}: {
  courses: IntonationCourseSummary[]
  onOpen: (courseId: string) => void
  onLeave: () => void
}) {
  if (courses.length === 0) {
    return (
      <main className="screen">
        <StatusBlock tone="waiting" message="아직 준비 중인 코스예요" action={<Button onClick={onLeave}>학습 종류로</Button>} />
      </main>
    )
  }

  // 서버가 seq 오름차순으로 주므로 레벨 묶음도 처음 나온 순서를 따른다 (W-1과 같은 규칙)
  const byLevel = new Map<number, IntonationCourseSummary[]>()
  for (const course of courses) byLevel.set(course.level, [...(byLevel.get(course.level) ?? []), course])

  return (
    <main className="item-screen">
      <h1 className="type-title">억양 학습</h1>
      {[...byLevel].map(([level, levelCourses]) => (
        <section key={level} className="word-level" aria-labelledby={`intonation-level-${level}`}>
          <h2 id={`intonation-level-${level}`} className="type-label word-level__title">
            레벨 {level}
          </h2>
          {levelCourses.map((course) => (
            // 추천 강조는 단어 학습 행 스타일을 그대로 쓴다. 추천은 서버 필드(KAN-268)라 많아야 1개다
            <button
              key={course.courseId}
              type="button"
              className={`word-set-row${course.recommended ? ' word-set-row--recommended' : ''}`}
              onClick={() => onOpen(course.courseId)}
            >
              <span className="intonation-row__text">
                <span className="type-body">{course.title}</span>
                {course.topic !== null && <span className="type-caption intonation-row__topic">{course.topic}</span>}
              </span>
              <span className="type-caption word-set-row__meta">
                {course.recommended && <span className="word-set-row__badge">추천</span>}
                {course.completed ? '완료' : `${course.completedCardCount}/${course.cardCount}장`}
              </span>
            </button>
          ))}
        </section>
      ))}
    </main>
  )
}

// ── A-2 대사 카드 = 일시정지 화면 ───────────────────────────────────────────
// 카드 진입 때 녹음 화면이 자동으로 열리므로(5단계) 이 화면은 녹음 화면을 뒤로가기로 닫았을 때 보인다

export function IntonationCardScreen({
  course,
  index,
  onBackToList,
  backLabel = '코스 목록으로',
}: {
  course: IntonationCourse
  index: number
  /** 복귀 모드(결과 목록에서 다시 녹음)면 [결과 목록으로]로 바뀐다 — 회신 없이 닫아도 막히지 않게 */
  onBackToList: () => void
  backLabel?: string
}) {
  const card = course.cards[index]
  const guidePoints = useMemo(
    () => (card !== undefined && card.guideF0.unit === 'semitone' ? guideCurveDisplayPoints(card.guideF0.values) : []),
    [card],
  )

  if (card === undefined) {
    // 카드 0장 코스 — 발행 검증이 막겠지만 화면이 깨지지 않게 막다른 곳의 유일한 출구를 둔다
    return (
      <main className="screen">
        <StatusBlock tone="waiting" message="아직 준비 중인 코스예요" action={<Button onClick={onBackToList}>코스 목록으로</Button>} />
      </main>
    )
  }

  const canRecord = canStartIntonationRecording()

  return (
    <main className="item-screen">
      <ProgressIndicator current={index + 1} total={course.cards.length} label="카드 진행률" />
      <div className="prompt-card">
        {card.standard !== null && (
          <>
            <span className="type-caption prompt-card__badge">표준어</span>
            <p className="type-title-sm">{card.standard}</p>
          </>
        )}
        <span className="type-caption prompt-card__badge">사투리</span>
        <h1 className="type-title">{card.dialect}</h1>
      </div>

      <div className="curve-card">
        <CurveLane
          label="가이드"
          ariaLabel="가이드 억양 곡선"
          segments={guidePoints.length > 0 ? [guidePoints] : []}
          variant="guide"
        />
      </div>

      {/* 기준 음원 재생(FR-AD-05, 0.75x·1.0x)은 음원 확보 전까지 범위 밖 — 별도 티켓 (2026-10-12 사용자 결정) */}

      <div className="item-screen__footer">
        {!canRecord && <p className="type-caption intonation-note">앱에서 녹음할 수 있어요</p>}
        <Button disabled={!canRecord} onClick={() => recordCard(course, index)} style={{ width: '100%' }}>
          다시 말해 보기
        </Button>
        <Button variant="text" onClick={onBackToList} style={{ width: '100%' }}>
          {backLabel}
        </Button>
      </div>
    </main>
  )
}

// ── A-4 분석 대기 ─────────────────────────────────────────────────────────
// 폴링은 훅이 한다. 이 화면은 마운트 뒤 경과 시간으로 단계·안심 문구만 그린다 — 상세의 대기는 attemptId를 key로 받아
// [다시 시도]마다 새로 마운트돼 폴링 예산과 같이 0부터 센다. 정상 대기엔 버튼이 없다(이탈은 시스템 뒤로가기, KAN-253).
// 마지막 회신 뒤 코스 전체 대기와 분석 중 행 상세 대기가 같은 화면이다

export function IntonationWaitingScreen() {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const elapsedMs = now - startedAt
  const stage = waitingStage(elapsedMs)

  // 단계 마크업·클래스는 레벨테스트 대기 화면(AnalysisWaitingScreen)과 같다. 세션 10문항에 묶인 그 화면 대신 카드 1건용
  return (
    <main className="screen">
      <div className="analysis-body analysis-body--centered">
        <div className="analysis-waiting">
          <h1 className="type-headline">분석 중이에요</h1>
          <div className="analysis-steps">
            {WAITING_STAGES.map((label, i) => {
              const step = i + 1
              const state = step < stage ? 'done' : step === stage ? 'current' : 'todo'
              return (
                <Fragment key={label}>
                  {step > 1 && (
                    <div className="analysis-step-line" data-state={step <= stage ? 'done' : 'todo'} aria-hidden="true" />
                  )}
                  <div className="analysis-step" data-state={state}>
                    <span className="analysis-step__dot" aria-hidden="true">
                      {state === 'done' ? <CheckSmallIcon /> : step}
                    </span>
                    <span className="type-caption analysis-step__label">{label}</span>
                  </div>
                </Fragment>
              )
            })}
          </div>
          {elapsedMs >= SLOW_NOTICE_MS && (
            <p className="type-caption status-block__detail">분석에 조금 더 걸리고 있어요. 곧 끝나요</p>
          )}
        </div>
      </div>
    </main>
  )
}

// ── A-4 실패 출구 (KAN-191: 버튼 하나) ──────────────────────────────────────

const RETRY_MESSAGE = {
  timeout: '분석이 예상보다 오래 걸리고 있어요',
  failed: '분석하지 못했어요. 다시 녹음해 주세요',
  misread: '제시된 문장과 다르게 들렸어요',
  quiet: '목소리가 작게 들렸어요',
} as const

export function IntonationRetryScreen({
  course,
  index,
  reason,
  onRetry,
  onRerecord,
  onBackToSummary,
}: {
  course: IntonationCourse
  index: number
  reason: keyof typeof RETRY_MESSAGE
  onRetry: () => void
  onRerecord: () => void
  onBackToSummary: () => void
}) {
  const card = course.cards[index]
  // 오독·조용함은 무엇을 다시 말할지 보여 준다 — 녹음 화면이 열리기 전에 대사를 다시 읽게
  const showLine = (reason === 'misread' || reason === 'quiet') && card !== undefined
  // 동작은 하나, 결과 목록 복귀는 텍스트 버튼으로 낮춘다 (KAN-191의 버튼 하나 규칙을 상세 안에서 유지)
  const action = (
    <>
      {reason === 'timeout' ? <Button onClick={onRetry}>다시 시도</Button> : <Button onClick={onRerecord}>다시 녹음</Button>}
      <Button variant="text" onClick={onBackToSummary}>
        결과 목록으로
      </Button>
    </>
  )
  return (
    <main className="screen">
      {showLine && (
        <div className="prompt-card">
          {card.standard !== null && (
            <>
              <span className="type-caption prompt-card__badge">표준어</span>
              <p className="type-title-sm">{card.standard}</p>
            </>
          )}
          <span className="type-caption prompt-card__badge">사투리</span>
          <p className="type-title">{card.dialect}</p>
        </div>
      )}
      <StatusBlock tone="error" message={RETRY_MESSAGE[reason]} action={action} />
    </main>
  )
}

// ── A-5 피드백 (KAN-254 3단계) ─────────────────────────────────────────────
// 위→아래 점수 → 대사 강조 → 가이드 곡선 → 어절 코멘트 → 직전 대비. 점수가 3초 안에 읽혀야 해서 맨 위다(NFR-US-01).
// 곡선 위엔 음절을 찍지 않는다 — 가이드 프레임과 음절의 시간 대응을 서버가 주지 않는다(2026-10-12 결정)

/** 대사에서 강조할 글자를 감싼다. 색 없이도 읽히게 밑줄·↑↓·코멘트 번호를 같이 단다(NFR-US-03) */
function MarkedLine({ text, marks }: { text: string; marks: SyllableMark[] }) {
  const nodes: ReactNode[] = []
  let from = 0
  // 한 어절 안에서 lower가 raise보다 앞 글자일 수 있어 위치순으로 다시 세운다
  for (const m of [...marks].sort((a, b) => a.index - b.index)) {
    const syllable = text[m.index]
    nodes.push(text.slice(from, m.index))
    nodes.push(
      // span엔 접근성 이름을 못 달아 role="img"로 세운다 — 글자·기호·번호를 한 번에 「뭇, 더 높이기, 1번」으로 읽힌다
      <span
        key={m.index}
        role="img"
        className={`intonation-mark intonation-mark--${m.mark}`}
        aria-label={`${syllable}, ${m.mark === 'raise' ? '더 높이기' : '낮추기'}, ${m.commentNo}번`}
      >
        {syllable}
        <span aria-hidden="true" className="intonation-mark__sign">
          {m.mark === 'raise' ? '↑' : '↓'}
          <sup>{m.commentNo}</sup>
        </span>
      </span>,
    )
    from = m.index + 1
  }
  nodes.push(text.slice(from))
  return <>{nodes}</>
}

export function IntonationFeedbackScreen({
  course,
  index,
  result,
  onBackToSummary,
  onRetry,
}: {
  course: IntonationCourse
  index: number
  result: { score: number; feedback: PitchFeedbackItem[]; previousScore: number | null }
  onBackToSummary: () => void
  onRetry: () => void
}) {
  const { score, feedback, previousScore } = result
  const card = course.cards[index]
  const guidePoints = useMemo(
    () => (card !== undefined && card.guideF0.unit === 'semitone' ? guideCurveDisplayPoints(card.guideF0.values) : []),
    [card],
  )
  if (card === undefined) return null // 훅이 있는 카드로만 'detail'을 세운다

  const delta = scoreDelta(score, previousScore)

  return (
    <main className="item-screen">
      <div className="intonation-score">
        <p className="type-caption intonation-score__caption">억양 점수</p>
        <p className="text-hero">{score}점</p>
      </div>

      <div className="prompt-card">
        {card.standard !== null && <p className="type-caption prompt-card__badge">{card.standard}</p>}
        <p className="type-title">
          <MarkedLine text={card.dialect} marks={syllableMarks(card.dialect, feedback)} />
        </p>
      </div>

      {guidePoints.length > 0 && (
        <div className="curve-card">
          <CurveLane label="경남 화자 억양" ariaLabel="가이드 억양 곡선" segments={[guidePoints]} variant="guide" />
        </div>
      )}

      {feedback.length > 0 ? (
        // 번호는 pitchFeedback 순서 — 대사 위 위첨자 번호와 같다
        <ol className="intonation-comments">
          {feedback.map((item, i) => (
            <li key={i} className="type-body">
              {feedbackComment(item)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-body">높낮이 순서가 경남 화자와 같아요</p>
      )}

      {delta !== null && (
        <p className="type-body intonation-delta">
          <span aria-hidden="true">지난번보다 {formatDelta(delta)}점</span>
          <span className="sr-only">
            지난번 {previousScore}점에서 {score}점
          </span>
        </p>
      )}

      {/* 점수와 무관하게 Primary는 결과 목록 복귀다 — 재도전은 보조로만 권한다 (5단계) */}
      <div className="item-screen__footer intonation-footer">
        <Button className="intonation-footer__back" onClick={onBackToSummary} style={{ width: '100%' }}>
          결과 목록으로
        </Button>
        <Button className="intonation-footer__retry" onClick={onRetry} style={{ width: '100%' }}>
          다시 시도
        </Button>
      </div>
    </main>
  )
}

// ── 결과 목록 (A-6 자리, KAN-254 5단계) ─────────────────────────────────────
// 완료 저장 호출은 없다. [코스 목록으로]가 목록을 다시 받으면 서버(KAN-268)가 completed를 계산해 준다.
// 행은 A-1 코스 행(.word-set-row)과 같은 종이 행이다

const ROW_STATUS: Record<Exclude<CardResult['outcome'], 'completed'>, string> = {
  processing: '분석 중',
  misread: '다시 녹음 필요',
  quiet: '다시 녹음 필요',
  failed: '다시 녹음 필요',
  timeout: '확인 필요',
}

export function IntonationSummaryScreen({
  course,
  results,
  onOpen,
  onBackToList,
}: {
  course: IntonationCourse
  results: Record<string, CardResult>
  onOpen: (index: number) => void
  onBackToList: () => void
}) {
  const scores = course.cards.flatMap((c) => {
    const r = results[c.cardId]
    return r?.outcome === 'completed' ? [r.score] : []
  })
  return (
    <main className="item-screen">
      <TextHero heading>{course.title} 코스를 마쳤어요</TextHero>
      {scores.length > 0 && (
        <p className="type-body word-complete__count">평균 {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}점</p>
      )}
      <div className="intonation-results">
        {course.cards.map((card, i) => {
          const r = results[card.cardId]
          if (r === undefined) return null // 회신 없이 끝난 카드는 없다 — 카드는 회신으로만 넘어간다
          return (
            <button key={card.cardId} type="button" className="word-set-row" onClick={() => onOpen(i)}>
              {/* 대사는 상세에서 보인다 — 목록은 번호만 (2026-10-12 사용자 결정) */}
              <span className="type-body">{i + 1}번 문항</span>
              <span className="type-caption word-set-row__meta">
                {r.outcome === 'completed' ? `${r.score}점` : ROW_STATUS[r.outcome]}
              </span>
            </button>
          )
        })}
      </div>
      <div className="item-screen__footer">
        <Button className="intonation-footer__retry" onClick={onBackToList} style={{ width: '100%' }}>
          코스 목록으로
        </Button>
      </div>
    </main>
  )
}
