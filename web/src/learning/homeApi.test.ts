/**
 * 홈 상태 API (KAN-287 1단계). 토큰·401 규칙 자체는 wordApi.test가 정본이고, 여기서는 경로가 그 공통 요청을
 * 타는지(갱신 재시도 한 줄)와 테스트 전후·streak 유무(KAN-286 미머지 서버) 모양을 본다.
 */

import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { fetchLearningHome } from './homeApi'
import { WordLearningError, type WordApiDeps } from './wordApi'

const API = 'http://localhost:8080/'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const AFTER_TEST = {
  levelTestTaken: true,
  levelTest: {
    testVersion: 'tv-1',
    scoreVersion: 'sv-0.3',
    tier: { code: 'HONORARY', name: '명예주민', rank: 4, of: 5 },
    completedAt: '2026-10-14T05:30:00Z',
  },
  recommendedCourseId: 'ic-02',
  recommendedSetId: 'ws-03',
  streak: { currentDays: 3, attendedToday: false, lastAttendedDate: '2026-10-14' },
}

const BEFORE_TEST = {
  levelTestTaken: false,
  levelTest: null,
  recommendedCourseId: null,
  recommendedSetId: null,
  streak: { currentDays: 0, attendedToday: false, lastAttendedDate: null },
}

function deps(fetchImpl: FetchLike, overrides: Partial<WordApiDeps> = {}): WordApiDeps {
  return { fetchImpl, getToken: () => 'acc-1', refreshToken: vi.fn(async () => true), ...overrides }
}

describe('GET /v0/learning/home', () => {
  it('테스트 후 + streak: 경로·헤더, 응답 그대로', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, AFTER_TEST))

    expect(await fetchLearningHome(API, deps(fetchImpl))).toEqual(AFTER_TEST)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/home')
    expect(init?.method).toBe('GET')
    expect(init?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer acc-1' })
  })

  it('테스트 전: levelTest null, 추천 null, 출석 0일', async () => {
    expect(await fetchLearningHome(API, deps(async () => jsonResponse(200, BEFORE_TEST)))).toEqual(BEFORE_TEST)
  })

  it('streak 키가 없는 구서버 응답도 통과하고 streak는 undefined', async () => {
    const { streak: _omit, ...legacy } = AFTER_TEST
    const home = await fetchLearningHome(API, deps(async () => jsonResponse(200, legacy)))
    expect(home.streak).toBeUndefined()
    expect(home.levelTest?.tier.code).toBe('HONORARY')
  })

  it('levelTestTaken true인데 levelTest null이어도 오류로 막지 않는다', async () => {
    const home = await fetchLearningHome(API, deps(async () => jsonResponse(200, { ...AFTER_TEST, levelTest: null })))
    expect(home.levelTestTaken).toBe(true)
    expect(home.levelTest).toBeNull()
  })

  it('401이면 갱신 1회 뒤 새 토큰으로 한 번 재시도한다', async () => {
    let token = 'old'
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, AFTER_TEST))
    const refreshToken = vi.fn(async () => {
      token = 'new'
      return true
    })

    await fetchLearningHome(API, deps(fetchImpl, { getToken: () => token, refreshToken }))
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[1][1]?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer new' })
  })

  it('5xx 오류 봉투는 code·retryable을 실은 WordLearningError', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(503, { code: 'SERVICE_UNAVAILABLE', message: '잠시 후 다시', retryable: true, retryAfterMs: 1000, correlationId: 'c' })
    const error = await fetchLearningHome(API, deps(fetchImpl)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WordLearningError)
    expect((error as WordLearningError).code).toBe('SERVICE_UNAVAILABLE')
    expect((error as WordLearningError).retryable).toBe(true)
  })

  it.each([
    ['tier 필드 누락', { ...AFTER_TEST, levelTest: { ...AFTER_TEST.levelTest, tier: { code: 'HONORARY', name: '명예주민', rank: 4 } } }],
    ['levelTestTaken 누락', { ...BEFORE_TEST, levelTestTaken: undefined }],
    ['streak 모양 깨짐', { ...AFTER_TEST, streak: { currentDays: '3', attendedToday: false, lastAttendedDate: null } }],
  ])('모양이 어긋나면(%s) 재시도 불가 오류', async (_name, broken) => {
    const error = await fetchLearningHome(API, deps(async () => jsonResponse(200, broken))).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WordLearningError)
    expect((error as WordLearningError).code).toBeNull()
    expect((error as WordLearningError).retryable).toBe(false)
  })
})
