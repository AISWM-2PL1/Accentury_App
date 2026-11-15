/**
 * 학습 탭 「사투리 여행」 (KAN-347 3단계) — 라우트와 화면 셋: 사투리 여행 지도(s-11), 코스 지도(s-16), 홈 이어가기 카드(s-02).
 * 진행은 `travel.ts`의 [buildTravel] 하나에서 나온다. 지도 [시작]·홈 [이어가기]·결과 [다음 스탬프]가 같은 `current`로 간다.
 *
 * 스탬프를 누르면 지금 있는 단어 세트 흐름(`WordLearningRoute`)·억양 코스 흐름(`IntonationLearningRoute`)으로 들어간다.
 * 옛 「세트 목록」「코스 목록」 화면은 이 지도로 대체됐다. 흐름에서 나가는 길은 [StampExits] 두 개다(3-8).
 *
 * 화면 값은 학습 탭 하나다(`?screen=learn`, 옛 값 `intonation`·`words`도 받는다 — `navigation/entryUrl`). 지도·코스 지도·스탬프
 * 사이의 이동은 URL에 싣지 않고 이 라우트의 상태로 한다(옛 목록 화면과 같은 이유: 학습은 이탈 허용이라 복원할 필요가 없다).
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { canOpenSettings, openSettings } from '../bridge/bridge'
import { TierCharacter } from '../result/ResultScreen'
import { Button, ScoreDonut, Stars, StatusBlock } from '../ui'
import { ArrowLeftIcon, ArrowRightIcon, CheckLineIcon, ClockIcon, CloudOffIcon, LockIcon, RefreshIcon, ToneLineIcon, UserIcon, WordLineIcon } from '../ui/icons'
import { STAR_PATH } from '../ui/Stars'
import { GuestLoginPrompt } from './GuestLoginPrompt'
import { fetchLearningHome } from './homeApi'
import { IntonationLearningRoute } from './IntonationLearningScreens'
import { STAMP_MINUTES, stampName, stampUnit, type StampKind } from './stampNaming'
import {
  celebrationFor,
  loadTravel,
  type Celebration,
  type StampExits,
  type Travel,
  type TravelCourse,
  type TravelStamp,
} from './travel'
import { COURSE_REGION_BOXES, COURSE_REGIONS, GYEONGNAM_OUTLINE } from './travelMapPaths'
import { errorExit } from './useWordLearning'
import { AUTH_GUEST_NOT_ALLOWED, WordLearningError, type WordApiDeps } from './wordApi'
import { WordLearningRoute } from './WordLearningScreens'

// ── 라우트 ──────────────────────────────────────────────────────────────

type TravelView =
  | { screen: 'loading' }
  | { screen: 'error'; error: WordLearningError }
  /** celebration: 스탬프를 마치고 막 돌아왔다 — 한 번만 돈다(다른 화면으로 가면 버린다) */
  | { screen: 'map'; travel: Travel; celebration: Celebration | null }
  | { screen: 'course'; travel: Travel; course: number }
  /** visit: 같은 스탬프로 다시 들어가도(다음 스탬프 = 방금 그 스탬프) 흐름을 새로 세우는 키 */
  | { screen: 'stamp'; travel: Travel; stamp: TravelStamp; visit: number }

export interface TravelRouteProps {
  apiBase: string
  /** 하단 탭 바 (KAN-252). 지도·코스 지도·로딩·게스트·오류에 선다(3-7). 스탬프 안(진행 중)에는 서지 않는다(KAN-147) */
  tabBar?: ReactNode
  /** 홈 [이어가기]로 들어왔다(`resume=1`) — 지도를 거치지 않고 지금 스탬프로 바로 (3-6) */
  resume?: boolean
  /** `resume`을 한 번 썼다 — App이 URL에서 걷는다(새로고침·재진입에 또 들어가지 않게) */
  onResumeConsumed?: () => void
  /** 테스트 주입용 (fetch·토큰 대체) */
  deps?: WordApiDeps
}

export function TravelRoute({ apiBase, tabBar, resume = false, onResumeConsumed, deps }: TravelRouteProps) {
  const [view, setView] = useState<TravelView>({ screen: 'loading' })
  const [tier, setTier] = useState<{ code: string; name: string } | null>(null)
  const visits = useRef(0)

  /** 진행을 다시 받아 다음 화면을 고른다. 실패는 목록 오류 화면(s-21)이고 [다시 시도]는 지도로 다시 받는다 */
  const reload = (next: (travel: Travel) => TravelView) => {
    setView({ screen: 'loading' })
    loadTravel(apiBase, deps).then(
      (travel) => setView(next(travel)),
      (error: unknown) =>
        setView({
          screen: 'error',
          error: error instanceof WordLearningError ? error : new WordLearningError(String(error), null, true),
        }),
    )
  }

  const stampView = (travel: Travel, stamp: TravelStamp): TravelView => ({
    screen: 'stamp',
    travel,
    stamp,
    visit: ++visits.current,
  })
  const mapView = (travel: Travel, celebration: Celebration | null = null): TravelView => ({ screen: 'map', travel, celebration })

  // 진입: 진행 한 번 + 지도 머리의 등급 캐릭터(홈 응답, 없거나 실패면 그림 없이). StrictMode 이중 실행은 조회 두 번일 뿐이다
  useEffect(() => {
    reload((travel) => {
      if (resume) onResumeConsumed?.()
      return resume && travel.current !== null ? stampView(travel, travel.current) : mapView(travel)
    })
    let alive = true
    fetchLearningHome(apiBase, deps).then(
      (home) => {
        if (alive && home.levelTest !== null) setTier(home.levelTest.tier)
      },
      () => {},
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  switch (view.screen) {
    case 'loading':
      return (
        <>
          <main className="screen">
            {/* 예외 화면 서식 (KAN-347 1단계, 시안 s-14-learning-loading) */}
            <StatusBlock tone="waiting" icon={<ClockIcon />} message="불러오는 중이에요" detail="잠시만 기다려 주세요" />
          </main>
          {tabBar}
        </>
      )
    case 'error':
      return (
        <>
          <TravelErrorScreen error={view.error} onRetry={() => reload((travel) => mapView(travel))} />
          {tabBar}
        </>
      )
    case 'map':
      return (
        <>
          <TravelMapScreen
            travel={view.travel}
            tier={tier}
            celebration={view.celebration}
            onStart={(stamp) => setView(stampView(view.travel, stamp))}
            onOpenCourse={(course) => setView({ screen: 'course', travel: view.travel, course })}
          />
          {tabBar}
        </>
      )
    case 'course': {
      const course = view.travel.courses.find((c) => c.course === view.course)
      if (course === undefined) return null
      return (
        <>
          <CourseMapScreen
            course={course}
            travel={view.travel}
            onBack={() => setView(mapView(view.travel))}
            onOpen={(stamp) => setView(stampView(view.travel, stamp))}
          />
          {tabBar}
        </>
      )
    }
    case 'stamp': {
      const { travel: before, stamp } = view
      const exits: StampExits = {
        toMap: () => reload((after) => mapView(after, celebrationFor(before, after, stamp))),
        toNextStamp: () =>
          reload((after) =>
            after.current !== null ? stampView(after, after.current) : mapView(after, celebrationFor(before, after, stamp)),
          ),
      }
      return stamp.kind === 'word' ? (
        <WordLearningRoute
          key={view.visit}
          apiBase={apiBase}
          stamp={stamp}
          // 성적표 「코스 별」 줄의 전 값 — 끝난 뒤 값은 흐름이 구간 요약을 다시 받는다 (4-4)
          courseStars={before.courses.find((c) => c.course === stamp.course)?.stars ?? null}
          exits={exits}
          tabBar={tabBar}
          deps={deps}
        />
      ) : (
        <IntonationLearningRoute key={view.visit} apiBase={apiBase} courseId={stamp.id} exits={exits} tabBar={tabBar} deps={deps} />
      )
    }
  }
}

// ── 탭 안 상태: 게스트·로그인 안내·목록 오류 (3-7) ──────────────────────────────

/** s-20 「설정에서 로그인」 폴백 — 로그인은 네이티브 설정 화면에 있다 */
const SIGN_IN = { message: '로그인하면 학습을 이어갈 수 있어요', detail: '학습 기록과 출석이 계정에 저장돼요' }

function TravelErrorScreen({ error, onRetry }: { error: WordLearningError; onRetry: () => void }) {
  if (error.code === AUTH_GUEST_NOT_ALLOWED) {
    return (
      <main className="screen">
        <GuestLoginPrompt screen />
      </main>
    )
  }
  if (errorExit({ error, fromList: true }) === 'leave') {
    return (
      <main className="screen">
        <StatusBlock
          tone="error"
          icon={<UserIcon />}
          message={SIGN_IN.message}
          detail={SIGN_IN.detail}
          action={canOpenSettings() ? <Button onClick={() => openSettings()}>설정에서 로그인</Button> : undefined}
        />
      </main>
    )
  }
  // 목록 오류 (s-21). 돌아갈 지도가 없으니 재시도로 안 풀리는 실패도 [다시 시도]다. 응답이 없었으면(네트워크) 코드 줄이 없다
  return (
    <main className="screen">
      <StatusBlock
        tone="error"
        icon={<CloudOffIcon />}
        message="목록을 불러오지 못했어요"
        detail="잠시 뒤 다시 시도해 주세요"
        action={
          <Button onClick={onRetry}>
            <RefreshIcon />
            다시 시도
          </Button>
        }
        code={error.status === null ? undefined : `오류 코드 ${error.status}`}
      />
    </main>
  )
}

// ── 공용 조각 ────────────────────────────────────────────────────────────

/** 별 하나 + 숫자 (「★ 51」「★ 5 / 21」). 읽히는 것은 label 한 줄이다 */
function StarCount({ label, children, size = 16 }: { label: string; children: ReactNode; size?: number }) {
  return (
    <span className="travel-star-count" role="img" aria-label={label}>
      <StarIcon size={size} />
      <span aria-hidden="true">{children}</span>
    </span>
  )
}

function StarIcon({ size, empty = false }: { size: number; empty?: boolean }) {
  return (
    <svg
      className={empty ? 'stars__star' : 'stars__star stars__star--filled'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={STAR_PATH} strokeLinejoin="round" />
    </svg>
  )
}

function KindIcon({ kind, size }: { kind: StampKind; size?: number }) {
  return kind === 'word' ? <WordLineIcon size={size} /> : <ToneLineIcon size={size} />
}

/** 지도는 얼마나 배웠는지 표시예요 — 테이프로 붙인 메모 (s-11·s-16) */
function MapMemo() {
  return (
    <p className="travel-memo" role="note">
      지도는 얼마나 배웠는지 표시예요
    </p>
  )
}

/** 여권 입국 도장 틀 + 코스 구역 실루엣 (움직임 타일 1 A안) */
function PassportStamp({ course, className, style }: { course: number; className?: string; style?: CSSProperties }) {
  const box = COURSE_REGION_BOXES[course - 1]
  const region = COURSE_REGIONS[course - 1]
  return (
    <svg className={className} style={style} viewBox="0 0 72 64" overflow="visible" aria-hidden="true">
      <rect x="2" y="2" width="68" height="60" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="5" y="5" width="62" height="54" rx="6" fill="none" stroke="currentColor" strokeWidth=".75" />
      {box !== undefined && region !== undefined && (
        <svg x="8" y="11.5" width="56" height="41" viewBox={box.join(' ')}>
          <path d={region} fill="currentColor" />
        </svg>
      )}
    </svg>
  )
}

// ── 사투리 여행 지도 (s-11) ───────────────────────────────────────────────

/** 코스 칩 자리(지도 상자에 대한 %, 시안 s-11). 인덱스 0이 1코스다 */
const CHIP_POSITIONS: readonly (readonly [number, number])[] = [
  [76, 23],
  [51, 31],
  [38, 49],
  [12, 64],
  [7, 26],
]

export function TravelMapScreen({
  travel,
  tier,
  celebration,
  onStart,
  onOpenCourse,
}: {
  travel: Travel
  tier: { code: string; name: string } | null
  celebration: Celebration | null
  onStart: (stamp: TravelStamp) => void
  onOpenCourse: (course: number) => void
}) {
  const { current, stars } = travel
  const currentCourse = current === null ? undefined : travel.courses.find((c) => c.course === current.course)

  return (
    <main className="item-screen travel">
      <div className="travel-head">
        <h1 className="type-title tab-title">사투리 여행</h1>
        {tier !== null && <TierCharacter code={tier.code} name={tier.name} className="illustration--travel" />}
        {/* 별 합계·막대는 KAN-359 값이 있을 때만 (3-5 서버 필드 전 동작) */}
        {stars !== null && (
          <div className="travel-total">
            <StarCount label={`별 ${stars.total}개`} size={16}>
              {stars.total}
            </StarCount>
            <div
              className="travel-total__track"
              role="progressbar"
              aria-label={`전체 코스 별 목표 합계 ${stars.goal}개 중 ${stars.total}개`}
              aria-valuemin={0}
              aria-valuemax={stars.goal}
              aria-valuenow={Math.min(stars.total, stars.goal)}
            >
              <span style={{ width: `${stars.goal === 0 ? 0 : Math.min(100, (stars.total / stars.goal) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      <Atlas travel={travel} unlocking={celebration?.unlocked ?? null} onOpenCourse={onOpenCourse} />
      <p className="travel-source">행정구역 경계: 통계청 SGIS(2013)</p>

      {celebration?.passport != null && <PassportPage course={celebration.passport} />}
      {celebration?.unlocked != null && (
        <p className="sr-only" role="status">
          {celebration.unlocked}코스가 열렸어요
        </p>
      )}

      {current !== null && currentCourse !== undefined && (
        <CurrentCourseCard
          course={currentCourse}
          stamp={current}
          stamped={celebration?.stamp === true}
          onStart={() => onStart(current)}
        />
      )}
      <MapMemo />
    </main>
  )
}

/** 경남 5코스 지도. 열린 코스 구역은 눌러서 코스 지도로 간다. 잠긴 구역은 누르지 않는다(그 코스의 스탬프가 전부 잠겨 있다) */
function Atlas({
  travel,
  unlocking,
  onOpenCourse,
}: {
  travel: Travel
  unlocking: number | null
  onOpenCourse: (course: number) => void
}) {
  const currentCourse = travel.current?.course
  const marker = currentCourse === undefined ? undefined : CHIP_POSITIONS[currentCourse - 1]
  // 시안 순서대로 그린다 — 지금 코스가 맨 위에 오도록 마지막에
  const ordered = [...travel.courses].sort((a, b) => Number(a.course === currentCourse) - Number(b.course === currentCourse))
  return (
    <div className="travel-atlas">
      <svg className="travel-atlas__map" viewBox="0 0 390 380" preserveAspectRatio="none" role="group" aria-label="다섯 코스 지도">
        <path className="travel-atlas__shadow" d={GYEONGNAM_OUTLINE} fillRule="evenodd" transform="translate(3.75 5)" />
        {ordered.map((course) => {
          const region = COURSE_REGIONS[course.course - 1]
          if (region === undefined) return null
          const state = regionState(course, currentCourse)
          const label = `${course.course}코스 · ${REGION_LABEL[state]}`
          if (!course.unlocked) {
            return (
              <g key={course.course} className={`travel-land is-${state}`} role="img" aria-label={label}>
                <path className="travel-land__region" d={region} />
              </g>
            )
          }
          const open = () => onOpenCourse(course.course)
          return (
            <g
              key={course.course}
              className={`travel-land is-${state}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={open}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  open()
                }
              }}
            >
              <path className="travel-land__region" d={region} />
            </g>
          )
        })}
        {marker !== undefined && (
          // 지금 코스 표시 — 칩 왼쪽 위 (시안 3코스 칩 (38%, 49%) ↔ 표시 (160, 164))
          <g className="travel-atlas__here" aria-hidden="true">
            <circle cx={(marker[0] / 100) * 390 + 12} cy={(marker[1] / 100) * 380 - 22} r="10" fill="none" />
            <circle cx={(marker[0] / 100) * 390 + 12} cy={(marker[1] / 100) * 380 - 22} r="5" />
          </g>
        )}
      </svg>
      {travel.courses.map((course) => {
        const position = CHIP_POSITIONS[course.course - 1]
        if (position === undefined) return null
        return (
          <CourseChip
            key={course.course}
            course={course}
            current={course.course === currentCourse}
            unlocking={course.course === unlocking}
            position={position}
          />
        )
      })}
    </div>
  )
}

type RegionState = 'done' | 'current' | 'open' | 'locked'
const REGION_LABEL: Record<RegionState, string> = { done: '완주', current: '진행 중', open: '열림', locked: '잠김' }

function regionState(course: TravelCourse, currentCourse: number | undefined): RegionState {
  if (!course.unlocked) return 'locked'
  if (course.completedCount === course.stamps.length) return 'done'
  return course.course === currentCourse ? 'current' : 'open'
}

/** 「n코스 ★ 모은 별/필요 별」. 잠긴 코스는 자물쇠 + 흐린 잉크. 별 줄은 KAN-359 값이 있을 때만 */
function CourseChip({
  course,
  current,
  unlocking,
  position,
}: {
  course: TravelCourse
  current: boolean
  /** 이번에 막 열렸다 — 자물쇠 고리가 들려 돌아간 뒤 열린 칩이 된다 (타일 5) */
  unlocking: boolean
  position: readonly [number, number]
}) {
  const { stars } = course
  const locked = !course.unlocked
  const label = [
    `${course.course}코스`,
    locked ? '잠김' : unlocking ? '열림' : null,
    stars === null ? null : `별 ${stars.collected}개, 필요 별 ${stars.required}개`,
  ]
    .filter((part) => part !== null)
    .join(', ')
  const className = ['travel-chip', current && 'is-current', locked && 'is-locked', unlocking && 'is-unlocking']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className} style={{ left: `${position[0]}%`, top: `${position[1]}%` }} role="img" aria-label={label}>
      <span aria-hidden="true">
        {(locked || unlocking) && <LockIcon size={12} />}
        {course.course}코스
      </span>
      {stars !== null && (
        <span aria-hidden="true">
          <StarIcon size={12} empty={stars.collected === 0} />
          {stars.collected} / {stars.required}
        </span>
      )}
    </div>
  )
}

/** 지금 코스 카드 — 「n코스 m/9」 진행 막대, 「★ n / 21」, 다음 스탬프 이름 · 「m번째 스탬프」 · 예상 시간, [시작 →] (3-3) */
function CurrentCourseCard({
  course,
  stamp,
  stamped,
  onStart,
}: {
  course: TravelCourse
  stamp: TravelStamp
  /** 방금 마친 스탬프의 도장이 찍힌다 (타일 1, 600ms) */
  stamped: boolean
  onStart: () => void
}) {
  const total = course.stamps.length
  return (
    <section className={`travel-card${stamped ? ' is-stamped' : ''}`} aria-label="지금 코스">
      <div className="travel-card__head">
        <span>
          {course.course}코스 {course.completedCount} / {total}
        </span>
        {course.stars !== null && (
          <StarCount label={`별 ${course.stars.collected}개, 다음 코스에 필요한 별 ${course.stars.required}개`}>
            {course.stars.collected} / {course.stars.required}
          </StarCount>
        )}
      </div>
      <div
        className="travel-card__track"
        role="progressbar"
        aria-label={`${course.course}코스 스탬프 ${total}개 중 ${course.completedCount}개`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={course.completedCount}
      >
        <span style={{ width: `${total === 0 ? 0 : (course.completedCount / total) * 100}%` }} />
      </div>
      <div className="travel-card__lesson">
        <KindIcon kind={stamp.kind} size={32} />
        <div>
          <h2>{stampName(stamp.kind, stamp.n)}</h2>
          <p className="travel-card__meta">
            <span>{stamp.order}번째 스탬프</span>
            <span className="travel-card__time">
              <ClockIcon size={16} />
              {STAMP_MINUTES[stamp.kind]}
            </span>
          </p>
        </div>
      </div>
      <Button onClick={onStart} style={{ width: '100%' }}>
        시작
        <ArrowRightIcon />
      </Button>
      {stamped && <PassportStamp course={course.course} className="travel-card__stamp" />}
    </section>
  )
}

/** 코스 완주 — 여권 페이지에 같은 도장 9개가 75ms 간격으로 찍힌다 (타일 5 앞부분). 축하만이고 열림과 무관하다 */
function PassportPage({ course }: { course: number }) {
  return (
    <section className="travel-passport" role="status" aria-label={`${course}코스 완주`}>
      <h2>{course}코스 완주</h2>
      <div className="travel-passport__stamps" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <PassportStamp key={i} course={course} style={{ '--stamp-index': i } as CSSProperties} />
        ))}
      </div>
      <p>스탬프 9개를 모두 완료했어요</p>
    </section>
  )
}

// ── 코스 지도 (s-16) ─────────────────────────────────────────────────────

/**
 * 스탬프 9개의 자리 — 시안 s-16 3코스 확대 지도(390×480 상자, 구역이 x 30~360·y 31~451에 놓인다)의 번호 원 좌표를 0~1로
 * 접었다. 코스마다 구역 모양이 달라 시안의 확대 그림을 그대로 쓸 수 없어, 구역을 상자에 맞춰 키운 뒤 같은 비율 자리에 둔다
 */
const NODE_LAYOUT: readonly (readonly [number, number])[] = [
  [132, 68], [140, 136], [80, 172], [148, 252], [184, 304], [224, 376], [276, 292], [280, 192], [196, 180],
].map(([x, y]) => [(x - 30) / 330, (y - 31) / 420] as const)

/** 확대 지도 상자: 폭 390, 구역을 330×420 안에 비율 그대로 맞추고 위아래 30을 둔다 */
function zoomFrame(course: number) {
  const [x, y, w, h] = COURSE_REGION_BOXES[course - 1] ?? [0, 0, 330, 420]
  const scale = Math.min(330 / w, 420 / h)
  const width = w * scale
  const height = h * scale
  const left = (390 - width) / 2
  return {
    viewHeight: height + 60,
    transform: `translate(${left} 30) scale(${scale}) translate(${-x} ${-y})`,
    node: (i: number) => {
      const [u, v] = NODE_LAYOUT[i % NODE_LAYOUT.length]
      return [left + u * width, 30 + v * height] as const
    },
  }
}

export function CourseMapScreen({
  course,
  travel,
  onBack,
  onOpen,
}: {
  course: TravelCourse
  travel: Travel
  onBack: () => void
  onOpen: (stamp: TravelStamp) => void
}) {
  const frame = zoomFrame(course.course)
  const region = COURSE_REGIONS[course.course - 1]
  const points = course.stamps.map((_, i) => frame.node(i))
  const current = course.stamps.find((s) => s.state === 'current')
  const hasNext = travel.courses.some((c) => c.course === course.course + 1)
  const { stars } = course

  return (
    <main className="item-screen travel travel--course">
      <div className="travel-course-head">
        <Button variant="text" className="travel-back" onClick={onBack}>
          <ArrowLeftIcon />
          지도로
        </Button>
        {stars !== null && (
          <StarCount label={`별 ${stars.collected}개, 필요 별 ${stars.required}개`} size={18}>
            {stars.collected} / {stars.required}
          </StarCount>
        )}
      </div>
      <h1 className="sr-only">{course.course}코스</h1>
      {stars !== null && hasNext && stars.collected < stars.required && (
        <p className="travel-course-note">
          별 {stars.required}개를 모으면 {course.course + 1}코스가 열려요
        </p>
      )}

      <div className="travel-zoom">
        <svg viewBox={`0 0 390 ${frame.viewHeight}`} aria-hidden="true">
          {region !== undefined && (
            <>
              <g transform="translate(3.75 5)">
                <path className="travel-zoom__shadow" d={region} transform={frame.transform} />
              </g>
              <path className="travel-zoom__land" d={region} transform={frame.transform} />
            </>
          )}
          <path className="travel-zoom__route" d={points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} />
          {course.stamps.map((stamp, i) => {
            const [x, y] = points[i]
            return (
              <g key={stamp.id} className={`travel-node is-${stamp.state}`} transform={`translate(${x} ${y})`}>
                {stamp.state === 'current' && <circle className="travel-node__ring" r="22" />}
                <circle className="travel-node__dot" r="16" transform={stamp.state === 'done' ? `rotate(${i % 2 === 0 ? -6 : 5})` : undefined} />
                {stamp.state === 'done' && <circle className="travel-node__inner" r="13.1" />}
                <text y="5" textAnchor="middle">
                  {stamp.order}
                </text>
              </g>
            )
          })}
          {current !== undefined && (
            <g transform={`translate(${points[current.order - 1][0] + 24} ${points[current.order - 1][1] + 32}) scale(.75)`}>
              <path className="travel-zoom__tape" d="M-40 -12L42 -10 39 12 -42 10Z" />
              <text className="travel-zoom__tape-text" textAnchor="middle" y="4">
                지금 여기
              </text>
            </g>
          )}
        </svg>
        <MapMemo />
      </div>

      <div className="travel-legend" aria-hidden="true">
        <span>
          <i className="travel-legend__done" />
          완료
        </span>
        <span>
          <i className="travel-legend__current" />
          지금 여기
        </span>
        <span>
          <i className="travel-legend__locked" />
          잠김
        </span>
      </div>

      <ol className="travel-stamps">
        {course.stamps.map((stamp) => (
          <li key={stamp.id}>
            <StampCard stamp={stamp} onOpen={() => onOpen(stamp)} />
          </li>
        ))}
      </ol>
    </main>
  )
}

const STATUS: Record<TravelStamp['state'], string> = {
  done: '완료',
  current: '지금 여기 · 시작',
  locked: '앞 스탬프를 완료하면 열려요',
}

/**
 * 스탬프 카드 3상태 (3-4): 완료 = 점수 원 + 별 3칸 + 「✓ 완료」(다시 할 수 있다), 지금 = 「지금 여기 · 시작」, 진행 전 = 빈 별 +
 * 「앞 스탬프를 완료하면 열려요」, 누를 수 없다. 별·점수 원은 KAN-359 값이 있을 때만 — 없으면 완료 표시만 (3-5)
 */
function StampCard({ stamp, onOpen }: { stamp: TravelStamp; onOpen: () => void }) {
  const kind = stamp.kind === 'word' ? '단어' : '억양'
  return (
    <button type="button" className={`travel-stamp-card is-${stamp.state}`} disabled={stamp.state === 'locked'} onClick={onOpen}>
      <span className="travel-stamp-card__icon">
        <KindIcon kind={stamp.kind} />
        <small aria-hidden="true">{stamp.order}</small>
      </span>
      <span className="travel-stamp-card__body">
        <span className="travel-stamp-card__kind">{kind}</span>
        <span className="travel-stamp-card__title">{stampName(stamp.kind, stamp.n)}</span>
        <span className="travel-stamp-card__meta">{stampUnit(stamp.kind)}</span>
        <span className="travel-stamp-card__status">
          {stamp.state === 'done' && <CheckLineIcon />}
          {STATUS[stamp.state]}
        </span>
      </span>
      {stamp.stars !== null && (
        <span className="travel-stamp-card__score">
          {stamp.state === 'done' && stamp.score !== null && <ScoreDonut score={stamp.score} size={44} />}
          <Stars count={stamp.stars} size={18} />
        </span>
      )}
    </button>
  )
}

// ── 홈 이어가기 카드 (s-02, 3-6) ──────────────────────────────────────────

/**
 * 테스트 후 홈의 「이어가기」 카드. 지도와 같은 진행 모델([loadTravel])의 `current`로 간다 — [이어가기]는 학습 탭을 `resume`으로
 * 열고, 그 라우트가 같은 `current`로 바로 들어간다(지도 [시작]과 같은 스탬프). 「스탬프 n개」는 KAN-359 값이 있을 때만.
 * 진행을 못 받았거나 열린 스탬프를 다 끝냈으면 카드를 그리지 않는다 — 홈의 덧붙인 정보라 오류 문구를 두지 않는다
 */
export function ContinueCard({ apiBase, onResume, deps }: { apiBase: string; onResume: () => void; deps?: WordApiDeps }) {
  const [travel, setTravel] = useState<Travel | null>(null)
  useEffect(() => {
    let alive = true
    loadTravel(apiBase, deps).then(
      (loaded) => {
        if (alive) setTravel(loaded)
      },
      () => {},
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase])

  const stamp = travel?.current
  if (travel === null || stamp == null) return null
  return (
    <section className="card travel-continue" aria-label="다음 스탬프">
      <div>
        <p className="travel-continue__where">
          {stamp.course}코스 · {stamp.order}번째 스탬프
        </p>
        <h2 className="travel-continue__title">{stampName(stamp.kind, stamp.n)}</h2>
        {travel.completedSetCount !== null && (
          <p className="travel-continue__count">
            <i aria-hidden="true" />
            스탬프 {travel.completedSetCount}개
          </p>
        )}
      </div>
      <Button onClick={onResume}>
        이어가기
        <ArrowRightIcon />
      </Button>
    </section>
  )
}
