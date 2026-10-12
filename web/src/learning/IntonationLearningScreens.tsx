/**
 * 억양 학습 화면 A-1(코스 목록)·A-2(대사 카드)와 라우트 (KAN-253 1단계). 상태는 [useIntonationLearning]이
 * 갖고 여기 화면들은 그리고 버튼을 잇기만 한다 — `WordLearningScreens.tsx`와 같은 나눔이다.
 *
 * 화면 규칙은 code wiki ux-ui.md 「억양 학습 화면 (KAN-253)」 절, 녹음 계약은 webview-bridge.md §12.
 */

import { useMemo } from 'react'
import { canStartIntonationRecording, startIntonationRecording } from '../bridge/bridge'
import { guideCurveDisplayPoints } from '../recording/guideCurve'
import { CurveLane } from '../recording/CurveLane'
import { Button, ProgressIndicator, StatusBlock } from '../ui'
import { CLIENT_NOT_SIGNED_IN, type WordApiDeps } from './wordApi'
import type { IntonationCourse, IntonationCourseSummary } from './intonationApi'
import { errorExit } from './useWordLearning'
import { useIntonationLearning, type IntonationLearningView } from './useIntonationLearning'

/** 녹음 최대 길이 — 레벨테스트 음성 문항과 같은 10초 컷 (KAN-253 브리지 계약) */
const MAX_DURATION_MS = 10_000

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
          onBackToList={learning.backToList}
        />
      )
    case 'submitted':
      return (
        <IntonationSubmittedScreen
          last={view.index === view.course.cards.length - 1}
          onNext={learning.nextCard}
          onBackToList={learning.backToList}
        />
      )
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

// ── A-2 대사 카드 ────────────────────────────────────────────────────────

export function IntonationCardScreen({
  course,
  index,
  onBackToList,
}: {
  course: IntonationCourse
  index: number
  onBackToList: () => void
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

  const record = () =>
    startIntonationRecording({
      cardId: card.cardId,
      prompt: card.dialect,
      standard: card.standard,
      maxDurationMs: MAX_DURATION_MS,
      guideF0: card.guideF0,
    })

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
        <Button disabled={!canRecord} onClick={record} style={{ width: '100%' }}>
          말해 보기
        </Button>
      </div>
    </main>
  )
}

// ── A-3 회신 뒤 자리 표시 (A-4 본 화면은 KAN-254) ─────────────────────────

export function IntonationSubmittedScreen({
  last,
  onNext,
  onBackToList,
}: {
  last: boolean
  onNext: () => void
  onBackToList: () => void
}) {
  // 출구는 하나: 다음 카드가 있으면 [다음 카드], 마지막이면 [코스 목록으로]
  const action = last ? (
    <Button onClick={onBackToList}>코스 목록으로</Button>
  ) : (
    <Button onClick={onNext}>다음 카드</Button>
  )
  return (
    <main className="screen">
      <StatusBlock tone="waiting" message="분석 중이에요" action={action} />
    </main>
  )
}
