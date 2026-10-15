/**
 * 홈 상태 API 클라이언트 (KAN-287 1단계) — 서버 KAN-268의 `GET /v0/learning/home`(명세서 §3.20)과
 * KAN-286이 더한 `streak`. 타입은 서버 DTO(`Accentury_Server` `backend/.../learning/LearningHomeResponse.java`)를
 * 그대로 옮겼다. tier는 결과(§3.7)와 같은 `ResultResponse.Tier`라 [ResultTier]를 재사용한다.
 *
 * 인증·401 갱신·오류 봉투 처리는 학습 API와 한 벌이다 — `wordApi.ts`의 [request]를 그대로 쓰고,
 * 실패도 같은 [WordLearningError]로 던진다(홈 화면이 학습 목록과 같은 401 규칙을 따르려고).
 *
 * `streak`는 선택 필드로 둔다. KAN-286(서버 PR #43)이 머지되기 전 서버는 키를 내보내지 않으므로,
 * 없으면 undefined로 통과시키고 화면이 출석 영역을 그리지 않는다. 있으면 모양을 검증한다.
 */

import type { ResultTier } from '../result/testResult'
import { hasFields, request, shapeError, type WordApiDeps } from './wordApi'

// ── 서버 DTO ────────────────────────────────────────────────────────────

/** `LearningAttendance.Streak` (KAN-286) */
export interface HomeStreak {
  /** 오늘 미출석이면 어제까지 센 값, 어제도 없으면 0 */
  currentDays: number
  attendedToday: boolean
  /** KST `yyyy-MM-dd`. 출석이 한 번도 없으면 null */
  lastAttendedDate: string | null
}

/** `LearningHomeResponse.LevelTest` — 최근 완주. 점수는 서버가 남기지 않아 없다 */
export interface HomeLevelTest {
  testVersion: string
  scoreVersion: string
  tier: ResultTier
  /** ISO Instant */
  completedAt: string
}

/** `GET /v0/learning/home` */
export interface LearningHome {
  levelTestTaken: boolean
  /** 기록이 없으면 null. levelTestTaken이 true여도 null일 수 있다고 보고 화면은 카드를 숨긴다 */
  levelTest: HomeLevelTest | null
  recommendedCourseId: string | null
  recommendedSetId: string | null
  /** KAN-286 미머지 서버는 키가 없다 — 그때 화면은 출석 영역을 그리지 않는다 */
  streak?: HomeStreak
}

// ── 경로 ─────────────────────────────────────────────────────────────

/** 홈 상태 (H-1) */
export async function fetchLearningHome(apiBase: string, deps: WordApiDeps = {}): Promise<LearningHome> {
  const body = await request(apiBase, '/v0/learning/home', 'GET', {}, deps)
  if (!isLearningHome(body)) throw shapeError()
  return body
}

// ── 응답 모양 검증 (필수 필드 타입만, nullable은 null 또는 그 타입) ─────────

const isStringOrNull = (v: unknown) => v === null || typeof v === 'string'

function isLevelTest(v: unknown): boolean {
  return (
    hasFields(v, { testVersion: 'string', scoreVersion: 'string', completedAt: 'string' }) &&
    hasFields(v.tier, { code: 'string', name: 'string', rank: 'number', of: 'number' })
  )
}

// levelTestTaken true인데 levelTest가 null인 서버 불일치는 통과시킨다 — 카드만 숨기면 되고,
// 여기서 막으면 홈 전체(출석 포함)가 오류로 바뀐다.
function isLearningHome(v: unknown): v is LearningHome {
  if (!hasFields(v, { levelTestTaken: 'boolean' })) return false
  if (v.levelTest !== null && !isLevelTest(v.levelTest)) return false
  if (!isStringOrNull(v.recommendedCourseId) || !isStringOrNull(v.recommendedSetId)) return false
  if (v.streak === undefined) return true
  return hasFields(v.streak, { currentDays: 'number', attendedToday: 'boolean' }) && isStringOrNull(v.streak.lastAttendedDate)
}

// ── 표시 ─────────────────────────────────────────────────────────────

const KST_DATE = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long' })

/**
 * 응시일 표시 (KAN-287 2단계) — ISO Instant를 KST 날짜 「2026년 10월 14일」로. 기기 시간대와 무관하게 KST로 고정한다
 * (출석 날짜 `lastAttendedDate`도 KST라 둘이 어긋나지 않게).
 * 파싱이 안 되면 빈 문자열 — `format`은 Invalid Date에 RangeError를 던지므로 먼저 거른다. 화면은 빈 문자열이면 응시일 줄을 뺀다.
 * 근거: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/format
 */
export function formatKstDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : KST_DATE.format(date)
}
