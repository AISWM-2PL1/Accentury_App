/**
 * 억양 학습 API 클라이언트 (KAN-253 1단계) — 서버 KAN-264/268의 `/v0/learning/intonation-courses` 두 경로와
 * KAN-267의 채점 결과 조회(KAN-254 1단계). 타입은 서버 DTO(`Accentury_Server` `backend/.../learning/
 * IntonationCourse*Response.java`, `IntonationAttemptResponse.java`)를 그대로 옮겼다.
 *
 * 인증·401 갱신·오류 봉투 처리는 단어 학습과 한 벌이다 — `wordApi.ts`의 [request]를 그대로 쓰고,
 * 실패도 같은 [WordLearningError]로 던진다(화면의 출구 규칙 `errorExit`을 함께 쓰려고).
 *
 * 녹음 업로드(`POST /v0/learning/intonation-cards/{cardId}/recordings`)는 네이티브가 하고, 여기엔
 * 결과 한 번 조회만 있다 — 폴링 주기·타임아웃은 화면 훅(KAN-254 2단계) 몫이다.
 */

import type { GuideF0 } from '../progress/testDefinition'
import { hasFields, isArrayOf, request, shapeError, type WordApiDeps } from './wordApi'

// ── 서버 DTO ────────────────────────────────────────────────────────────

/** `IntonationCourseListResponse.Summary` */
export interface IntonationCourseSummary {
  courseId: string
  seq: number
  level: number
  topic: string | null
  title: string
  cardCount: number
  /** 채점이 COMPLETED로 끝난 시도가 하나라도 있는 카드 수 — 점수와 무관 */
  completedCardCount: number
  completed: boolean
  /** 목록 안에서 많아야 하나만 true (서버 §3.20) */
  recommended: boolean
}

/** `GET /v0/learning/intonation-courses` — 코스는 seq 오름차순, 없으면 빈 배열 */
export interface IntonationCourseList {
  contentVersion: string
  courses: IntonationCourseSummary[]
}

/** `IntonationCourseResponse.Card` */
export interface IntonationCard {
  cardId: string
  seq: number
  /** 표준어 원문. 없으면 null — 화면은 생략한다 */
  standard: string | null
  /** 사투리 대사 */
  dialect: string
  /** 레벨테스트 정의와 같은 형식 (서버 `TestDefinition.GuideF0`) */
  guideF0: GuideF0
  /** 기준 음원 완성 URL. 서버에 기준 URL 설정이 아직 없어 지금은 늘 null */
  referenceAudioUrl: string | null
}

/** `GET /v0/learning/intonation-courses/{courseId}` */
export interface IntonationCourse {
  contentVersion: string
  courseId: string
  seq: number
  level: number
  topic: string | null
  title: string
  cards: IntonationCard[]
}

/** `AnalysisJobStatus` — 분석 작업과 같은 네 값 */
export type IntonationAttemptStatus = 'PROCESSING' | 'COMPLETED' | 'RETRYABLE_FAILED' | 'FAILED'

/**
 * `PitchFeedback` — 높낮이 순서가 경남 화자와 다른 어절 하나. raise·lower는 키가 늘 있고 값이 null일 수 있다.
 * split이면 경남 화자끼리 갈려 둘 다 null, split이 아닌데 둘 다 null이면 최고 음절은 맞고 나머지 순서만 다르다.
 */
export interface PitchFeedbackItem {
  word: string
  /** 경남 화자가 가장 높이는 음절 글자 */
  raise: string | null
  /** 사용자가 가장 높인 음절 글자 */
  lower: string | null
  split: boolean
}

/**
 * `GET /v0/learning/intonation-attempts/{attemptId}` (KAN-267 §3.19). 서버가 NON_NULL로 내보내 완료 전용
 * 필드는 COMPLETED일 때만, error는 실패일 때만 키가 있다. previousScore만은 완료면 키가 있고 직전 시도가
 * 없으면 null이다.
 */
export interface IntonationAttempt {
  attemptId: string
  contentVersion: string
  cardId: string
  status: IntonationAttemptStatus
  pollAfterMs: number
  /** 0~100 정수 */
  score?: number
  pitchFeedback?: PitchFeedbackItem[]
  previousScore?: number | null
  /** retryable은 status가 RETRYABLE_FAILED인지에서 나온다 */
  error?: { code: string; retryable: boolean }
  modelVersion?: string
  scoreVersion?: string
}

// ── 경로 ─────────────────────────────────────────────────────────────

/** 코스 목록 (A-1) */
export async function fetchIntonationCourses(apiBase: string, deps: WordApiDeps = {}): Promise<IntonationCourseList> {
  const body = await request(apiBase, '/v0/learning/intonation-courses', 'GET', {}, deps)
  if (!isCourseList(body)) throw shapeError()
  return body
}

/**
 * 코스 상세 — 대사 카드 (A-2). 404 `LEARNING_COURSE_NOT_FOUND`(retryable false).
 * 카드는 seq 순으로 정렬해 돌려준다 — 화면이 배열 순서대로 진행하기 때문이다.
 */
export async function fetchIntonationCourse(
  apiBase: string,
  courseId: string,
  deps: WordApiDeps = {},
): Promise<IntonationCourse> {
  const body = await request(apiBase, `/v0/learning/intonation-courses/${encodeURIComponent(courseId)}`, 'GET', {}, deps)
  if (!isCourse(body)) throw shapeError()
  return { ...body, cards: [...body.cards].sort((a, b) => a.seq - b.seq) }
}

/** 채점 결과 한 번 조회 (A-4 폴링 한 회, A-5 피드백). 404 `LEARNING_ATTEMPT_NOT_FOUND`·403 `LEARNING_ATTEMPT_FORBIDDEN`. */
export async function fetchIntonationAttempt(
  apiBase: string,
  attemptId: string,
  deps: WordApiDeps = {},
): Promise<IntonationAttempt> {
  const body = await request(apiBase, `/v0/learning/intonation-attempts/${encodeURIComponent(attemptId)}`, 'GET', {}, deps)
  if (!isAttempt(body)) throw shapeError()
  return body
}

// ── 응답 모양 검증 (필수 필드 타입만, nullable은 null 또는 그 타입) ─────────

const isStringOrNull = (v: unknown) => v === null || typeof v === 'string'

const SUMMARY_FIELDS = {
  courseId: 'string', seq: 'number', level: 'number', title: 'string', cardCount: 'number',
  completedCardCount: 'number', completed: 'boolean', recommended: 'boolean',
} as const

function isCourseList(v: unknown): v is IntonationCourseList {
  return hasFields(v, { contentVersion: 'string' }) && isArrayOf(v.courses, SUMMARY_FIELDS, (c) => isStringOrNull(c.topic))
}

function isGuideF0(v: unknown): boolean {
  return hasFields(v, { unit: 'string', frameIntervalMs: 'number' }) && Array.isArray(v.values)
}

function isCourse(v: unknown): v is IntonationCourse {
  return (
    hasFields(v, { contentVersion: 'string', courseId: 'string', seq: 'number', level: 'number', title: 'string' }) &&
    isStringOrNull(v.topic) &&
    isArrayOf(
      v.cards,
      { cardId: 'string', seq: 'number', dialect: 'string' },
      (c) => isStringOrNull(c.standard) && isStringOrNull(c.referenceAudioUrl) && isGuideF0(c.guideF0),
    )
  )
}

const ATTEMPT_STATUSES: readonly string[] = ['PROCESSING', 'COMPLETED', 'RETRYABLE_FAILED', 'FAILED']

// 완료면 화면이 점수·피드백을 바로 그리므로 그 필드까지 본다. 실패의 error는 있으면 모양만 본다
// — 없어도 화면은 code 없는 실패로 다룬다.
function isAttempt(v: unknown): v is IntonationAttempt {
  if (!hasFields(v, { attemptId: 'string', contentVersion: 'string', cardId: 'string', status: 'string', pollAfterMs: 'number' })) return false
  if (!ATTEMPT_STATUSES.includes(v.status as string)) return false
  if (v.error !== undefined && !hasFields(v.error, { code: 'string', retryable: 'boolean' })) return false
  if (v.status !== 'COMPLETED') return true
  return (
    typeof v.score === 'number' &&
    (v.previousScore === null || typeof v.previousScore === 'number') &&
    isArrayOf(v.pitchFeedback, { word: 'string', split: 'boolean' }, (f) => isStringOrNull(f.raise) && isStringOrNull(f.lower))
  )
}
