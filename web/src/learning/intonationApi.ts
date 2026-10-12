/**
 * 억양 학습 API 클라이언트 (KAN-253 1단계) — 서버 KAN-264/268의 `/v0/learning/intonation-courses` 두 경로.
 * 타입은 서버 DTO(`Accentury_Server` `backend/.../learning/IntonationCourse*Response.java`)를 그대로 옮겼다.
 *
 * 인증·401 갱신·오류 봉투 처리는 단어 학습과 한 벌이다 — `wordApi.ts`의 [request]를 그대로 쓰고,
 * 실패도 같은 [WordLearningError]로 던진다(화면의 출구 규칙 `errorExit`을 함께 쓰려고).
 *
 * 녹음 업로드(`POST /v0/learning/intonation-cards/{cardId}/recordings`)는 네이티브가 하고, 결과
 * 폴링(`GET /v0/learning/intonation-attempts/{attemptId}`)은 KAN-254다 — 여기엔 없다.
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

// ── 두 경로 ─────────────────────────────────────────────────────────────

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
