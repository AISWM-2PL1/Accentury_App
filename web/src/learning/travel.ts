/**
 * 사투리 여행 진행 모델 (KAN-347 3단계 3-3~3-6). 단어 세트 목록 + 억양 코스 목록(+ 서버 KAN-359 구간 요약)을 코스 5개 ×
 * 스탬프 9개로 묶고, 「지금 스탬프」를 정한다. 지도 [시작], 홈 [이어가기], 결과 화면 [다음 스탬프](4·5단계)가 모두
 * [buildTravel]의 `current` 하나를 쓴다 — 자리마다 따로 고르면 같은 진행에서 세 버튼이 다른 스탬프로 간다.
 *
 * - 이름·순서는 `stampNaming`(3-2)이 정한다. 여기서는 완료·별·잠금만 얹는다.
 * - 순차 잠금(확정된 결정 2026-11-16): 코스 안에서 앞 스탬프를 끝내야 다음이 열린다. 앱이 표시만 하고 서버는 막지 않는다.
 *   완료한 스탬프는 늘 「완료」, 완료하지 않은 첫 스탬프가 「지금」, 그 뒤는 「잠김」이다.
 * - 코스 열림은 서버 값(KAN-359 `levels[].unlocked`)을 그대로 쓴다. 모두 1코스부터, 레벨 테스트 등급은 쓰지 않는다.
 * - 별은 서버 값(`stars`, `collectedStars`, `totalStars`)을 그대로 그린다. 앱이 점수로 별을 다시 계산하지 않는다 (3-5).
 *
 * ## KAN-359 전 동작 (3-5)
 *
 * 구간 요약(`GET /v0/learning/levels`)을 받지 못하면(배포 전 서버는 404) 별 합계·코스 별·잠금을 전부 null로 두고 **모든
 * 코스를 연 상태**로 만든다. 완료는 지금 있는 `completed`(단어 세트·억양 코스)다. 그래서 별 없이 먼저 배포할 수 있다.
 * 요약 조회가 실패해도 목록 두 개만 있으면 지도는 선다 — 요약 실패로 학습 탭 전체를 오류로 막지 않는다.
 */

import { fetchIntonationCourses, type IntonationCourseSummary } from './intonationApi'
import { courseStamps, type Stamp, type StampKind } from './stampNaming'
import { fetchWordSets, hasFields, isArrayOf, request, shapeError, type WordApiDeps, type WordSetSummary } from './wordApi'

// ── KAN-359 구간 요약 (서버 아직 없음, 필드 이름은 KAN-359 본문) ──────────────────

/** `levels[]` 한 칸 — 구간(코스) 하나 */
export interface LevelSummary {
  level: number
  /** 억양 + 단어 세트 수 (9) */
  setCount: number
  completedSetCount: number
  /** 필요 별을 넘을 수 있다(구간당 최대 27) */
  collectedStars: number
  requiredStars: number
  unlocked: boolean
}

/** `GET /v0/learning/levels` (KAN-359 Requirements 4) */
export interface LearningLevels {
  totalStars: number
  /** 별 경계 [30, 70] — 억양 결과의 「이번 스탬프」 별(5단계)이 쓴다 */
  starThresholds: number[]
  levels: LevelSummary[]
}

/** 구간 요약 한 번 조회. 배포 전 서버는 404라 호출자가 실패를 「KAN-359 없음」으로 접는다 ([loadTravel]) */
export async function fetchLearningLevels(apiBase: string, deps: WordApiDeps = {}): Promise<LearningLevels> {
  const body = await request(apiBase, '/v0/learning/levels', 'GET', {}, deps)
  if (!isLearningLevels(body)) throw shapeError()
  return body
}

/**
 * 구간 요약의 제한 시간. 요약은 선택 정보라(없으면 「KAN-359 없음」 화면) 응답 없이 걸린 요청이 지도·성적표를 붙잡으면 안 된다.
 * 작은 집계 한 건이라 정상 응답은 1초 안이다. 3초는 「화면이 멈췄다」로 느끼기 전에 별 없는 화면으로 넘어가는 선이다.
 */
export const LEVELS_TIMEOUT_MS = 3000

/** 구간 요약 — 실패·제한 시간 초과면 null. 요청은 끊지 않는다(`request`가 AbortSignal을 받지 않음): 늦은 응답은 버린다 */
export function fetchLearningLevelsOrNull(apiBase: string, deps: WordApiDeps = {}): Promise<LearningLevels | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), LEVELS_TIMEOUT_MS)
    fetchLearningLevels(apiBase, deps)
      .then(resolve, () => resolve(null))
      .finally(() => clearTimeout(timer))
  })
}

function isLearningLevels(v: unknown): v is LearningLevels {
  return (
    hasFields(v, { totalStars: 'number' }) &&
    Array.isArray(v.starThresholds) &&
    v.starThresholds.every((t) => typeof t === 'number') &&
    isArrayOf(v.levels, {
      level: 'number', setCount: 'number', completedSetCount: 'number', collectedStars: 'number',
      requiredStars: 'number', unlocked: 'boolean',
    })
  )
}

// ── 모델 ─────────────────────────────────────────────────────────────

export type StampState = 'done' | 'current' | 'locked'

export interface TravelStamp extends Stamp {
  /** 코스 안 순번 1~9 (「m번째 스탬프」) */
  order: number
  state: StampState
  completed: boolean
  /** 세트 점수 0~100 (KAN-359 최고 기록). 없으면 null — KAN-359 전이거나 아직 안 한 세트 */
  score: number | null
  /** 별 0~3 (KAN-359). KAN-359 전이면 null — 화면이 별을 그리지 않는다 */
  stars: number | null
}

export interface TravelCourse {
  course: number
  stamps: TravelStamp[]
  completedCount: number
  /** KAN-359 전에는 늘 true */
  unlocked: boolean
  /** 「★ 모은 별 / 필요 별」. KAN-359 전이면 null */
  stars: { collected: number; required: number } | null
}

export interface Travel {
  courses: TravelCourse[]
  /** 지도 [시작]·홈 [이어가기]·[다음 스탬프]의 목적지. 열린 코스를 다 끝냈으면 null */
  current: TravelStamp | null
  /** 전체 별 합계와 목표(필요 별 합). KAN-359 전이면 null */
  stars: { total: number; goal: number } | null
  /** 모은 스탬프 수 — 홈 「스탬프 n개」(구간 요약 `completedSetCount`의 합). KAN-359 전이면 null */
  completedSetCount: number | null
}

/** 별을 실은 목록 요약 (KAN-359 Requirements 3). 키가 없으면 KAN-359 전 서버다 */
interface StarFields {
  completed?: boolean
  score?: number | null
  stars?: number
}

export function buildTravel(
  words: WordSetSummary[],
  intonations: IntonationCourseSummary[],
  levels: LearningLevels | null,
): Travel {
  const progress = new Map<string, StarFields>()
  for (const w of words) progress.set(`word:${w.setId}`, w)
  for (const c of intonations) progress.set(`intonation:${c.courseId}`, c)

  const stamps = courseStamps(
    words.map((w) => ({ id: w.setId, level: w.level, seq: w.seq })),
    intonations.map((c) => ({ id: c.courseId, level: c.level, seq: c.seq })),
  )

  const courses: TravelCourse[] = [...stamps].map(([course, list]) => {
    const level = levels?.levels.find((l) => l.level === course)
    // 서버가 그 구간을 빠뜨리면 연다 — 잠금은 표시일 뿐이라(서버는 막지 않는다) 못 들어가게 하는 쪽이 더 나쁘다
    const unlocked = levels === null ? true : (level?.unlocked ?? true)
    let currentTaken = false
    const travelStamps = list.map((stamp, i): TravelStamp => {
      const p = progress.get(`${stamp.kind}:${stamp.id}`) ?? {}
      const completed = p.completed === true
      let state: StampState = 'locked'
      if (completed) state = 'done'
      else if (unlocked && !currentTaken) {
        state = 'current'
        currentTaken = true
      }
      return {
        ...stamp,
        order: i + 1,
        state,
        completed,
        score: levels !== null && typeof p.score === 'number' ? p.score : null,
        stars: levels !== null && typeof p.stars === 'number' ? p.stars : null,
      }
    })
    return {
      course,
      stamps: travelStamps,
      completedCount: travelStamps.filter((s) => s.completed).length,
      unlocked,
      stars: level === undefined ? null : { collected: level.collectedStars, required: level.requiredStars },
    }
  })

  return {
    courses,
    current: courses.flatMap((c) => c.stamps).find((s) => s.state === 'current') ?? null,
    stars:
      levels === null
        ? null
        : { total: levels.totalStars, goal: levels.levels.reduce((sum, l) => sum + l.requiredStars, 0) },
    completedSetCount: levels === null ? null : levels.levels.reduce((sum, l) => sum + l.completedSetCount, 0),
  }
}

/** 목록 두 개와 구간 요약을 같이 받는다. 요약 실패·제한 시간 초과는 「KAN-359 없음」이다(머리 주석). 목록 실패는 그대로 던진다 */
export async function loadTravel(apiBase: string, deps: WordApiDeps = {}): Promise<Travel> {
  const [words, intonations, levels] = await Promise.all([
    fetchWordSets(apiBase, deps),
    fetchIntonationCourses(apiBase, deps),
    fetchLearningLevelsOrNull(apiBase, deps),
  ])
  return buildTravel(words.sets, intonations.courses, levels)
}

export function findTravelStamp(travel: Travel, kind: StampKind, id: string): TravelStamp | undefined {
  return travel.courses.flatMap((c) => c.stamps).find((s) => s.kind === kind && s.id === id)
}

/**
 * 스탬프 흐름(단어 세트·억양 코스)에서 나가는 길 (KAN-347 3-8). 사투리 여행 라우트(`TravelScreens`)가 만들어 흐름에 넘긴다.
 * - `toMap`: 사투리 여행 지도로. 방금 그 스탬프를 마쳤으면 지도가 도장·여권 페이지·자물쇠를 한 번 돌린다([celebrationFor]) —
 *   흐름은 「마쳤다」를 따로 알리지 않는다. 라우트가 들어가기 전 진행과 돌아와 다시 받은 진행을 견주기 때문이다.
 * - `toNextStamp`: 지도를 거치지 않고 다음 스탬프로 (결과 화면 [다음 스탬프], 4·5단계). 목적지는 진행을 다시 받아
 *   [buildTravel]의 `current`다(지도 [시작]·홈 [이어가기]와 같은 스탬프). 열린 스탬프가 없으면 지도로 간다.
 */
export interface StampExits {
  toMap: () => void
  toNextStamp: () => void
}

// ── 지도 복귀 움직임 (3단계 움직임 타일 1·5) ────────────────────────────────

/**
 * 스탬프를 마치고 지도로 돌아왔을 때 돌릴 움직임. 들어가기 전 진행(`before`)과 돌아와 다시 받은 진행(`after`)을 견준다 —
 * 서버가 완료라 말한 것만 축하한다(분석 실패로 완료가 안 된 억양 스탬프에 도장을 찍지 않는다).
 *
 * - `stamp`: 방금 마친 스탬프가 이번에 처음 완료됐다 → 지금 코스 카드에 도장(타일 1).
 * - `passport`: 그 완료로 코스의 스탬프가 모두 찼다(완주) → 여권 페이지(타일 5 앞부분). 이때는 카드 도장 대신이다.
 * - `unlocked`: 이번에 새로 열린 코스 → 그 코스 칩의 자물쇠가 열린다(타일 5 지도 부분). 완주와 같이 오면 여권 페이지 뒤다.
 *   별 기준만이라(KAN-359) 완주해도 별이 모자라면 null이다. KAN-359 전에는 모두 열려 있어 늘 null이다.
 */
export interface Celebration {
  stamp: boolean
  passport: number | null
  unlocked: number | null
}

export function celebrationFor(before: Travel, after: Travel, finished: { kind: StampKind; id: string }): Celebration | null {
  const was = findTravelStamp(before, finished.kind, finished.id)
  const now = findTravelStamp(after, finished.kind, finished.id)
  const newlyCompleted = now?.completed === true && was?.completed !== true
  const course = newlyCompleted ? after.courses.find((c) => c.course === now.course) : undefined
  const passport = course !== undefined && course.completedCount === course.stamps.length ? course.course : null
  const unlocked =
    after.courses.find((c) => c.unlocked && before.courses.find((b) => b.course === c.course)?.unlocked === false)?.course ??
    null
  const celebration = { stamp: newlyCompleted && passport === null, passport, unlocked }
  return celebration.stamp || passport !== null || unlocked !== null ? celebration : null
}

// ── 성적표 「코스 별」 줄 (4-4·5-4) ──────────────────────────────────────────

/**
 * 이 스탬프를 마치기 전과 뒤의 코스 별. 전후 값은 둘 다 서버 구간 요약(KAN-359)의 `collectedStars`(최고 기록 기준)다 —
 * 앱이 점수로 다시 계산하지 않는다(3-5). `unlocked`는 이번 결과로 그 코스의 별이 필요 별에 **처음** 닿아 열린 다음 코스 번호다.
 */
export interface CourseStarsChange {
  course: number
  before: number
  after: number
  required: number
  unlocked: number | null
  /** 다음 코스가 있는지. 마지막 코스면 false — 「다음 코스까지」 문구를 그리지 않는다 */
  hasNext: boolean
}

/** 들어가기 전 코스 별(`TravelCourse.stars`)과 끝난 뒤 다시 받은 구간 요약을 견준다. 어느 쪽이든 없으면(KAN-359 전) null — 줄을 숨긴다 */
export function courseStarsChange(
  course: number,
  before: { collected: number } | null,
  after: LearningLevels | null,
): CourseStarsChange | null {
  const level = after?.levels.find((l) => l.level === course)
  if (before === null || level === undefined) return null
  const reached = before.collected < level.requiredStars && level.collectedStars >= level.requiredStars
  const next = after!.levels.some((l) => l.level === course + 1)
  return {
    course,
    before: before.collected,
    after: level.collectedStars,
    required: level.requiredStars,
    unlocked: reached && next ? course + 1 : null,
    hasNext: next,
  }
}
