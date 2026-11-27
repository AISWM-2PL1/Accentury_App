/**
 * 억양 스탬프 화면 (KAN-253·KAN-254 → KAN-347 5단계): A-2(대사 카드)·A-4(분석 대기·실패 출구)·카드 피드백(s-19)·결과 상세(s-08-intonation-detail)·
 * 성적표(s-07-A)와 라우트. 상태는 [useIntonationLearning]이
 * 갖고 여기 화면들은 그리고 버튼을 잇기만 한다 — `WordLearningScreens.tsx`와 같은 나눔이다.
 *
 * 화면 규칙은 code wiki ux-ui.md 「억양 학습 화면 (KAN-253)」·「억양 학습 피드백 (KAN-254)」 절, 녹음 계약은 webview-bridge.md §12.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { canStartIntonationRecording } from '../bridge/bridge'
import { guideCurveDisplayPoints } from '../recording/guideCurve'
import { CurveLane } from '../recording/CurveLane'
import { Button, CloseButton, ProgressIndicator, ScoreDonut, StatusBlock } from '../ui'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckSmallIcon,
  ChevronRightIcon,
  ClockIcon,
  CloudOffIcon,
  MicLineIcon,
  RefreshIcon,
  UserIcon,
} from '../ui/icons'
import { IntonationCurveLoop } from '../ui/IntonationCurveLoop'
import { AUTH_GUEST_NOT_ALLOWED, CLIENT_NOT_SIGNED_IN, type WordApiDeps } from './wordApi'
import type { IntonationCourse, PitchFeedbackItem } from './intonationApi'
import { courseStarsChange, type CourseStarsChange, type StampExits } from './travel'
import { stampName, type Stamp } from './stampNaming'
import { StampDoneBadge, StampReward } from './StampReward'
import { GuestLoginPrompt } from './GuestLoginPrompt'
import { errorExit } from './useWordLearning'
import { recordCard, useIntonationLearning, type CardResult, type IntonationLearningView } from './useIntonationLearning'
import { SLOW_NOTICE_MS, WAITING_STAGES, waitingStage } from './intonationWaiting'
import {
  deltaDescription,
  feedbackAdvice,
  feedbackComment,
  formatDelta,
  practiceIndex,
  reportScore,
  starsForScore,
  syllableMarks,
  type SyllableMark,
} from './intonationFeedback'

// ── 라우트 ──────────────────────────────────────────────────────────────

export interface IntonationLearningRouteProps {
  apiBase: string
  /** 스탬프 하나 = 억양 코스 하나(`stamp.id`). 사투리 여행 지도(`TravelScreens`)가 고른다. 「억양 학습 n」의 n에 쓴다 */
  stamp: Stamp
  /** 들어가기 전 이 코스의 별 (`TravelCourse.stars`). KAN-359 전이면 null — 성적표 「코스 별」 줄을 숨긴다 */
  courseStars: { collected: number; required: number } | null
  /**
   * 나가는 길 (KAN-347 3-8). 코스 안 화면의 공통 출구는 오른쪽 위 ✕(지도로)다. 네이티브 녹음 오버레이의 ×도 지도로 간다(5-1) —
   * 네이티브가 학습 탭 문서(`screen=intonation`, 새 빌드는 `learn`)로 이동해 지도가 다시 서고, 웹에 따로 알리는 브리지는 없다.
   * 성적표는 [다음 스탬프](`toNextStamp`)·「지도로」(`toMap`)를 쓴다
   */
  exits: StampExits
  /**
   * 하단 탭 바 (KAN-252). App이 앱 안에서만 넘긴다. 로그인 안내(오류 출구 'leave')에서만 그린다 — 카드·대기·결과처럼
   * 코스 안 화면에는 탭 바를 두지 않는다(KAN-147). 로그인 안내에서는 이 탭 바가 유일한 출구다
   */
  tabBar?: ReactNode
  /** 테스트 주입용 (fetch·토큰 대체) */
  deps?: WordApiDeps
}

export function IntonationLearningRoute({ apiBase, stamp, courseStars, exits, tabBar, deps }: IntonationLearningRouteProps) {
  const learning = useIntonationLearning(apiBase, stamp.id, deps, { course: stamp.course, stars: courseStars })
  const { view } = learning
  // 지도로 나가면 이 라우트가 내려가며 폴링·deadline 타이머를 전부 끊는다(훅의 언마운트 정리) — 늦은 채점 응답은 버려진다
  const close = <CloseButton onClick={exits.toMap} />

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
          <IntonationErrorScreen view={view} onToMap={exits.toMap} />
          {errorExit(view) === 'leave' && tabBar}
        </>
      )
    case 'card':
      return (
        <>
          <IntonationCardScreen
            key={view.index}
            course={view.course}
            index={view.index}
            onBack={view.revisit ? learning.backToSummary : exits.toMap}
            backLabel={view.revisit ? '결과 목록으로' : '지도로'}
          />
          {close}
        </>
      )
    case 'waiting':
      // 정상 대기엔 화면 안 버튼이 없어 ✕가 유일한 화면 안 출구다
      return (
        <>
          <IntonationWaitingScreen />
          {close}
        </>
      )
    case 'summary':
      // ✕ 자리에는 「스탬프 완료」가 선다 — 출구는 화면 안 [다음 스탬프]·「지도로」 (s-07-A)
      return (
        <IntonationReportScreen
          course={view.course}
          n={stamp.n}
          results={learning.results}
          courseStars={courseStarsChange(stamp.course, courseStars, learning.levels)}
          starThresholds={learning.levels?.starThresholds ?? null}
          onOpen={learning.openDetail}
          onNextStamp={exits.toNextStamp}
          onToMap={exits.toMap}
        />
      )
    case 'detail': {
      const result = learning.results[view.course.cards[view.index]?.cardId ?? '']
      if (result === undefined) return null // 회신이 온 카드만 목록 행이 된다
      if (result.outcome === 'processing') {
        return (
          <>
            <IntonationWaitingScreen key={result.attemptId} />
            {close}
          </>
        )
      }
      if (result.outcome === 'completed') {
        // 결과 상세(s-08)는 위 「← 결과 목록으로」가 출구라 ✕가 없다. 다시 녹음한 뒤의 카드 피드백(s-19)은 ✕가 선다
        return (
          <>
            <IntonationFeedbackScreen
              course={view.course}
              n={stamp.n}
              index={view.index}
              result={result}
              afterRecording={view.afterRecording}
              onBackToSummary={learning.backToSummary}
              onRetry={learning.rerecord}
            />
            {view.afterRecording && close}
          </>
        )
      }
      return (
        <>
          <IntonationRetryScreen
            course={view.course}
            index={view.index}
            reason={result.outcome}
            onRetry={learning.retryPolling}
            onRerecord={learning.rerecord}
            onBackToSummary={learning.backToSummary}
          />
          {close}
        </>
      )
    }
  }
}

// ── 오류 ────────────────────────────────────────────────────────────────

const SIGN_IN_MESSAGE = '로그인하면 억양 학습을 할 수 있어요'

function IntonationErrorScreen({
  view,
  onToMap,
}: {
  view: Extract<IntonationLearningView, { screen: 'error' }>
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

// ── A-2 대사 카드 = 일시정지 화면 ───────────────────────────────────────────
// 카드 진입 때 녹음 화면이 자동으로 열리므로(5단계) 이 화면은 녹음 화면을 뒤로가기로 닫았을 때 보인다

export function IntonationCardScreen({
  course,
  index,
  onBack,
  backLabel = '지도로',
}: {
  course: IntonationCourse
  index: number
  /** 복귀 모드(결과 목록에서 다시 녹음)면 [결과 목록으로]로 바뀐다 — 회신 없이 닫아도 막히지 않게 */
  onBack: () => void
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
        <StatusBlock tone="waiting" message="아직 준비 중인 코스예요" action={<Button onClick={onBack}>{backLabel}</Button>} />
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
        <Button variant="text" onClick={onBack} style={{ width: '100%' }}>
          {backLabel}
        </Button>
      </div>
    </main>
  )
}

// ── A-4 분석 대기 ─────────────────────────────────────────────────────────
// 폴링은 훅이 한다. 이 화면은 마운트 뒤 경과 시간으로 단계·안심 문구만 그린다 — 상세의 대기는 attemptId를 key로 받아
// [다시 시도]마다 새로 마운트돼 폴링 예산과 같이 0부터 센다. 정상 대기엔 화면 안 버튼이 없다(이탈은 라우트가 세우는 ✕·시스템 뒤로가기, KAN-253·KAN-252).
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
  // 제목 아래 억양 곡선 루프도 같은 부품이다 — 두 대기 화면이 같은 모양으로 기다린다 (KAN-302)
  // `screen--analysis-wait`: 이 대기 화면은 KAN-347 공통 규칙에서 빠지고 지금 모양을 지킨다 (components.css)
  return (
    <main className="screen screen--analysis-wait">
      <div className="analysis-body analysis-body--centered">
        <div className="analysis-waiting">
          <h1 className="type-headline">분석 중이에요</h1>
          <IntonationCurveLoop />
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

// ── 카드 피드백 (s-19)·결과 상세 (s-08-intonation-detail) ─────────────────────
// 카드 한 장(「억양 학습 n · m번째 대사」·표준어·음절 표시 사투리·점수 원 + 증감) → 곡선 카드 → 번호 코멘트 → 주 버튼 [다시 말해 보기].
// 곡선 위엔 음절을 찍지 않는다 — 가이드 프레임과 음절의 시간 대응을 서버가 주지 않는다(2026-10-12 결정)

/** 대사에서 강조할 글자를 감싼다. 색 없이도 읽히게 밑줄 모양(올리기 실선·낮추기 점선)·↑↓·코멘트 번호를 같이 단다(NFR-US-03) */
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
        <span className="intonation-mark__syllable">{syllable}</span>
        <span aria-hidden="true" className="intonation-mark__sign">
          {m.mark === 'raise' ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
          <sup>{m.commentNo}</sup>
        </span>
      </span>,
    )
    from = m.index + 1
  }
  nodes.push(text.slice(from))
  return <>{nodes}</>
}

/** 증감 「▲9」「▼3」, 첫 시도면 「첫 기록」 — 보이는 글자다. 스크린 리더 문장은 부르는 쪽이 [deltaDescription]으로 단다 */
function deltaText(score: number, previousScore: number | null): string {
  return previousScore === null ? '첫 기록' : formatDelta(score - previousScore)
}

export function IntonationFeedbackScreen({
  course,
  n,
  index,
  result,
  afterRecording,
  onBackToSummary,
  onRetry,
}: {
  course: IntonationCourse
  /** 「억양 학습 n」의 n */
  n: number
  index: number
  result: { score: number; feedback: PitchFeedbackItem[]; previousScore: number | null }
  /** 다시 녹음한 뒤의 카드 피드백(s-19)이면 true — 「결과 목록으로」가 아래 글자 버튼. false면 결과 상세(s-08) — 위 「← 결과 목록으로」 */
  afterRecording: boolean
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

  return (
    <main className="item-screen intonation-feedback">
      {!afterRecording && (
        <Button variant="text" className="intonation-feedback__back" onClick={onBackToSummary}>
          <ArrowLeftIcon />
          결과 목록으로
        </Button>
      )}

      <section className="intonation-result-card" aria-label="대사와 억양 학습 결과">
        <p className="intonation-result-card__context">
          {stampName('intonation', n)} · {index + 1}번째 대사
        </p>
        {card.standard !== null && <p className="intonation-result-card__standard">{card.standard}</p>}
        <h1 className="intonation-result-card__dialect">
          <MarkedLine text={card.dialect} marks={syllableMarks(card.dialect, feedback)} />
        </h1>
        <div
          className="intonation-result-card__score"
          role="group"
          aria-label={`억양 점수 ${score}점, ${deltaDescription(score, previousScore)}`}
        >
          <ScoreDonut score={score} size={88} />
          <div aria-hidden="true">
            <p className="intonation-result-card__delta">{deltaText(score, previousScore)}</p>
            {previousScore !== null && <p className="intonation-result-card__previous">지난번 {previousScore}점</p>}
          </div>
        </div>
      </section>

      {guidePoints.length > 0 && (
        <div className="curve-card">
          <CurveLane label="경남 화자 억양" ariaLabel="가이드 억양 곡선" segments={[guidePoints]} variant="guide" />
        </div>
      )}

      {feedback.length > 0 ? (
        // 번호는 pitchFeedback 순서 — 대사 위 위첨자 번호와 같다. 원 번호는 CSS 카운터라 글자에는 섞이지 않는다
        <ol className="intonation-comments" aria-label="어절별 교정 코멘트">
          {feedback.map((item, i) => (
            <li key={i}>{feedbackComment(item)}</li>
          ))}
        </ol>
      ) : (
        <p className="type-body">높낮이 순서가 경남 화자와 같아요</p>
      )}

      {/* 주 버튼은 [다시 말해 보기], 「결과 목록으로」는 글자 버튼 — 2026-11-05 사용자 결정(디자인 검토 19건 중 「다시 말해 보기를
          주 버튼으로」)이 2026-10-12 결정(목록 복귀가 Primary)을 뒤집었다 (KAN-347 5-3) */}
      <div className="item-screen__footer intonation-feedback__footer">
        <Button onClick={onRetry} style={{ width: '100%' }}>
          <MicLineIcon />
          다시 말해 보기
        </Button>
        {afterRecording && (
          <Button variant="text" onClick={onBackToSummary} style={{ width: '100%' }}>
            결과 목록으로
          </Button>
        )}
      </div>
    </main>
  )
}

// ── 성적표 (s-07-A, KAN-347 5-4) ──────────────────────────────────────────
// 완료 저장 호출은 없다. 「지도로」·[다음 스탬프]가 진행을 다시 받으면 서버(KAN-268)가 completed를 계산해 준다(KAN-347 3단계).

const ROW_STATUS: Record<Exclude<CardResult['outcome'], 'completed'>, string> = {
  processing: '분석 중',
  misread: '다시 녹음 필요',
  quiet: '다시 녹음 필요',
  failed: '다시 녹음 필요',
  timeout: '확인 필요',
}

/**
 * 억양 성적표. 점수 = 이번에 녹음한 대사 전부의 채점 점수 평균 반올림, 「이번 스탬프」 별 = 그 점수 + `starThresholds`(없으면 30·70).
 * 점수가 없는 대사가 하나라도 있으면 점수 원·별·「코스 별」 줄과 「스탬프 완료」를 그리지 않는다 — 그 대사들은 목록 행으로 보인다.
 * 「다시 연습할 대사」는 최저점 대사 한 장(동점이면 앞), 그 대사에 코멘트가 없어도 카드는 서고 조언 줄(①)만 뺀다 — 서버는 저장된 피드백이 없으면 빈 목록을 준다(PR #76 리뷰).
 */
export function IntonationReportScreen({
  course,
  n,
  results,
  courseStars,
  starThresholds,
  onOpen,
  onNextStamp,
  onToMap,
}: {
  course: IntonationCourse
  /** 「억양 학습 n」의 n */
  n: number
  results: Record<string, CardResult>
  /** 코스 별 전후 (KAN-359). null이면 「코스 별」 줄을 숨긴다 */
  courseStars: CourseStarsChange | null
  /** 구간 요약 `starThresholds`. null이면 앱 상수 */
  starThresholds: readonly number[] | null
  onOpen: (index: number) => void
  onNextStamp: () => void
  onToMap: () => void
}) {
  const scores = course.cards.map((c) => {
    const r = results[c.cardId]
    return r?.outcome === 'completed' ? r.score : null
  })
  const score = reportScore(scores)
  const pick = practiceIndex(scores, starThresholds)
  const pickCard = pick === null ? undefined : course.cards[pick]
  const pickResult = pickCard === undefined ? undefined : results[pickCard.cardId]
  const practice = pickResult?.outcome === 'completed' ? pickResult : null

  return (
    <>
      <main className="item-screen intonation-report">
        <h1 className="type-title">{stampName('intonation', n)} 결과</h1>
        {score !== null && (
          <StampReward score={score} stars={starsForScore(score, starThresholds)} course={courseStars} />
        )}
        {/* 분석이 끝나지 않은 대사(분석 중·다시 녹음 필요·확인 필요)는 지금처럼 목록 행 — 누르면 그 대사 상세 */}
        {course.cards.some((c) => results[c.cardId] !== undefined && results[c.cardId].outcome !== 'completed') && (
          <div className="intonation-results">
            {course.cards.map((card, i) => {
              const r = results[card.cardId]
              if (r === undefined || r.outcome === 'completed') return null
              return (
                <button key={card.cardId} type="button" className="word-set-row intonation-result-tile" onClick={() => onOpen(i)}>
                  <span className="type-body intonation-result__label">{i + 1}번째 대사</span>
                  <span className="type-caption word-set-row__meta">{ROW_STATUS[r.outcome]}</span>
                </button>
              )
            })}
          </div>
        )}
        {practice !== null && pickCard !== undefined && pick !== null && (
          <section className="intonation-practice" aria-labelledby="intonation-practice-title">
            <h2 id="intonation-practice-title" className="type-title-sm">
              다시 연습할 대사
            </h2>
            <button type="button" className="intonation-practice__card" onClick={() => onOpen(pick)}>
              <span className="intonation-practice__main">
                <span className="intonation-practice__copy">
                  <span className="intonation-practice__dialect">
                    <MarkedLine text={pickCard.dialect} marks={syllableMarks(pickCard.dialect, practice.feedback)} />
                  </span>
                  <span className="intonation-practice__meta">
                    {pickCard.standard !== null && <span>{pickCard.standard}</span>}
                    <span className="intonation-practice__delta" aria-hidden="true">
                      {deltaText(practice.score, practice.previousScore)}
                    </span>
                    <span className="sr-only">{deltaDescription(practice.score, practice.previousScore)}</span>
                  </span>
                </span>
                <ScoreDonut score={practice.score} size={48} />
                <ChevronRightIcon />
              </span>
              {practice.feedback.length > 0 && (
                <span className="intonation-practice__tip">
                  <span className="intonation-practice__no" aria-hidden="true">
                    ①
                  </span>
                  {feedbackAdvice(practice.feedback[0])}
                </span>
              )}
            </button>
          </section>
        )}
        <div className="item-screen__footer intonation-report__footer">
          <Button onClick={onNextStamp} style={{ width: '100%' }}>
            다음 스탬프
            <ArrowRightIcon />
          </Button>
          <Button variant="text" onClick={onToMap} style={{ width: '100%' }}>
            지도로
          </Button>
        </div>
      </main>
      {score !== null && <StampDoneBadge />}
    </>
  )
}
