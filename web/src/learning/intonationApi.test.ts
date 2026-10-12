/**
 * 억양 학습 API (KAN-253 1단계). 토큰·401 규칙 자체는 wordApi.test가 정본이고, 여기서는 두 경로가
 * 그 공통 요청을 타는지(갱신 재시도 한 줄)와 억양 DTO의 null 필드·404 code를 본다.
 */

import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { fetchIntonationCourse, fetchIntonationCourses } from './intonationApi'
import { WordLearningError, type WordApiDeps } from './wordApi'

const API = 'http://localhost:8080/'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const GUIDE = { unit: 'semitone', frameIntervalMs: 10, values: [0, null, 1] }

const LIST = {
  contentVersion: 'it-gn-2026.10.1',
  courses: [
    { courseId: 'ic-01', seq: 1, level: 1, topic: '인사', title: '반가워요', cardCount: 3, completedCardCount: 1, completed: false, recommended: true },
    { courseId: 'ic-02', seq: 2, level: 1, topic: null, title: '시장', cardCount: 2, completedCardCount: 2, completed: true, recommended: false },
  ],
}

const COURSE = {
  contentVersion: 'it-gn-2026.10.1',
  courseId: 'ic-01',
  seq: 1,
  level: 1,
  topic: null,
  title: '반가워요',
  cards: [
    { cardId: 'c2', seq: 2, standard: null, dialect: '밥 뭇나', guideF0: GUIDE, referenceAudioUrl: null },
    { cardId: 'c1', seq: 1, standard: '안녕하세요', dialect: '안녕하능교', guideF0: GUIDE, referenceAudioUrl: 'https://cdn/x.m4a' },
  ],
}

function deps(fetchImpl: FetchLike, overrides: Partial<WordApiDeps> = {}): WordApiDeps {
  return { fetchImpl, getToken: () => 'acc-1', refreshToken: vi.fn(async () => true), ...overrides }
}

describe('억양 코스 두 경로', () => {
  it('목록: GET /v0/learning/intonation-courses, topic null도 그대로', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, LIST))

    expect(await fetchIntonationCourses(API, deps(fetchImpl))).toEqual(LIST)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/intonation-courses')
    expect(init?.method).toBe('GET')
    expect(init?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer acc-1' })
  })

  it('빈 목록은 오류가 아니다', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { contentVersion: 'v', courses: [] }))
    expect((await fetchIntonationCourses(API, deps(fetchImpl))).courses).toEqual([])
  })

  it('상세: 경로 인코딩, null 필드 유지, 카드는 seq 순', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, COURSE))

    const course = await fetchIntonationCourse(API, 'ic 01', deps(fetchImpl))
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:8080/v0/learning/intonation-courses/ic%2001')
    expect(course.cards.map((c) => c.cardId)).toEqual(['c1', 'c2'])
    expect(course.cards[1].standard).toBeNull()
    expect(course.cards[1].referenceAudioUrl).toBeNull()
    expect(course.cards[0].guideF0).toEqual(GUIDE)
  })

  it('모양이 어긋나면(필수 필드 누락·guideF0 없음) 재시도 불가 오류', async () => {
    const broken = { ...COURSE, cards: [{ ...COURSE.cards[0], guideF0: undefined }] }
    const error = await fetchIntonationCourse(API, 'ic-01', deps(async () => jsonResponse(200, broken))).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WordLearningError)
    expect((error as WordLearningError).retryable).toBe(false)
  })

  it('404 LEARNING_COURSE_NOT_FOUND는 code 그대로, retryable false', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(404, { code: 'LEARNING_COURSE_NOT_FOUND', message: '없는 억양 코스입니다.', retryable: false, retryAfterMs: null, correlationId: 'c' })
    const error = (await fetchIntonationCourse(API, 'nope', deps(fetchImpl)).catch((e: unknown) => e)) as WordLearningError
    expect(error.code).toBe('LEARNING_COURSE_NOT_FOUND')
    expect(error.retryable).toBe(false)
  })

  it('401이면 갱신 1회 뒤 새 토큰으로 한 번 재시도한다', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, LIST))
    let token = 'old'
    const refreshToken = vi.fn(async () => {
      token = 'new'
      return true
    })

    await fetchIntonationCourses(API, deps(fetchImpl, { getToken: () => token, refreshToken }))
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect((fetchImpl.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe('Bearer new')
  })

  it('토큰이 없으면 네트워크 전에 CLIENT_NOT_SIGNED_IN', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    const error = (await fetchIntonationCourses(API, deps(fetchImpl, { getToken: () => null })).catch((e: unknown) => e)) as WordLearningError
    expect(error.code).toBe('CLIENT_NOT_SIGNED_IN')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
