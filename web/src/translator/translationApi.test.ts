import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { CLIENT_NOT_SIGNED_IN, UNAUTHENTICATED, WordLearningError, type WordApiDeps } from '../learning/wordApi'
import { translate } from './translationApi'

const API = 'http://localhost:8080/'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

function envelope(code: string, message: string, retryable: boolean) {
  return { code, message, retryable, retryAfterMs: null, correlationId: 'c_test' }
}

function deps(fetchImpl: FetchLike, overrides: Partial<WordApiDeps> = {}): WordApiDeps {
  return { fetchImpl, getToken: () => 'acc-1', refreshToken: vi.fn(async () => true), ...overrides }
}

async function caught(promise: Promise<unknown>): Promise<WordLearningError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(WordLearningError)
  return error as WordLearningError
}

describe('translate — POST /v0/translations (KAN-256)', () => {
  it('200이면 dialect를 준다. 본문 {text}, Bearer·JSON 헤더', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나' }))
    await expect(translate(API, '밥 먹었어?', deps(fetchImpl))).resolves.toBe('밥 뭇나')
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8080/v0/translations', {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Bearer acc-1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '밥 먹었어?' }),
    })
  })

  it.each([
    [400, 'VALIDATION_FAILED', false],
    [422, 'TRANSLATION_TOO_LONG', false],
    [422, 'TRANSLATION_REJECTED', false],
    [503, 'TRANSLATION_UNAVAILABLE', true],
  ])('%i %s → 같은 code·retryable %s', async (status, code, retryable) => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(status, envelope(code, '서버 문구', retryable)))
    const error = await caught(translate(API, '안녕', deps(fetchImpl)))
    expect(error.code).toBe(code)
    expect(error.retryable).toBe(retryable)
  })

  it('401 → 갱신 1회 → 새 토큰으로 한 번 재시도해 성공', async () => {
    let token = 'old'
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(401, envelope('AUTH_TOKEN_INVALID', '인증 필요', false)))
      .mockResolvedValueOnce(jsonResponse(200, { dialect: '안녕하이소' }))
    const refreshToken = vi.fn(async () => {
      token = 'new'
      return true
    })
    await expect(translate(API, '안녕하세요', deps(fetchImpl, { getToken: () => token, refreshToken }))).resolves.toBe('안녕하이소')
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect((fetchImpl.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe('Bearer new')
  })

  it('401 → 갱신 뒤에도 401이면 UNAUTHENTICATED, 더 재시도하지 않는다', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(401, envelope('AUTH_TOKEN_INVALID', '인증 필요', false)))
    const error = await caught(translate(API, '안녕', deps(fetchImpl)))
    expect(error.code).toBe(UNAUTHENTICATED)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('토큰이 없으면 네트워크 전에 CLIENT_NOT_SIGNED_IN', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    const error = await caught(translate(API, '안녕', deps(fetchImpl, { getToken: () => null })))
    expect(error.code).toBe(CLIENT_NOT_SIGNED_IN)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('네트워크 실패는 code 없는 retryable', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = await caught(translate(API, '안녕', deps(fetchImpl)))
    expect(error.code).toBeNull()
    expect(error.retryable).toBe(true)
  })

  it.each([[{}], [{ dialect: 3 }], [{ dialect: '  ' }], [null]])('잘못된 응답 모양 %j → 재시도 불가 오류', async (body) => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, body))
    const error = await caught(translate(API, '안녕', deps(fetchImpl)))
    expect(error.code).toBeNull()
    expect(error.retryable).toBe(false)
  })
})
