import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import {
  completeWordAttempt,
  fetchWordSet,
  fetchWordSets,
  startWordAttempt,
  submitWordAnswer,
  WordLearningError,
  type WordApiDeps,
} from './wordApi'

const API = 'http://localhost:8080/'

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

/** 오류 봉투(§2.3) 대역. 클라이언트가 읽지 않는 필드도 실물처럼 실어 둔다 */
function envelope(code: string, message: string, retryable: boolean) {
  return { code, message, retryable, retryAfterMs: null, correlationId: 'c_test' }
}

const SET_LIST = {
  contentVersion: 'wd-gn-2026.10.1',
  sets: [{ setId: 'ws-01', seq: 1, level: 1, category: '음식', title: '먹을 것', cardCount: 6, itemCount: 6 }],
}
const SET = {
  contentVersion: 'wd-gn-2026.10.1',
  setId: 'ws-01',
  seq: 1,
  level: 1,
  category: '음식',
  title: '먹을 것',
  cards: [{ cardId: 'c1', standard: '부추', dialect: '정구지' }],
  items: [{ itemId: 'i1', seq: 1, cardId: 'c1', prompt: '정구지는?', choices: [{ choiceId: 'i1a', text: '부추' }] }],
}
const ATTEMPT = { attemptId: 'a1', contentVersion: 'wd-gn-2026.10.1', setId: 'ws-01', itemCount: 6, startedAt: '2026-10-08T00:00:00Z' }
const ANSWER = { correct: false, correctChoiceId: 'i1a', correctText: '부추', explanation: '정구지는 부추', answeredCount: 1, itemCount: 6 }
const RESULT = {
  attemptId: 'a1',
  contentVersion: 'wd-gn-2026.10.1',
  setId: 'ws-01',
  itemCount: 6,
  correctCount: 5,
  accuracyPercent: 83,
  wrongItems: [
    {
      itemId: 'i1', cardId: 'c1', prompt: '정구지는?', chosenChoiceId: 'i1b', chosenText: '시금치',
      correctChoiceId: 'i1a', correctText: '부추', explanation: '정구지는 부추',
    },
  ],
  completedAt: '2026-10-08T00:05:00Z',
}

function deps(fetchImpl: FetchLike, overrides: Partial<WordApiDeps> = {}): WordApiDeps {
  return { fetchImpl, getToken: () => 'acc-1', refreshToken: vi.fn(async () => true), ...overrides }
}

async function caught(promise: Promise<unknown>): Promise<WordLearningError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(WordLearningError)
  return error as WordLearningError
}

describe('요청 형태 — 다섯 경로', () => {
  const base = { Accept: 'application/json', Authorization: 'Bearer acc-1' }

  it('세트 목록: GET /v0/learning/word-sets', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, SET_LIST))

    expect(await fetchWordSets(API, deps(fetchImpl))).toEqual(SET_LIST)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/word-sets')
    expect(init?.method).toBe('GET')
    expect(init?.headers).toEqual(base)
    expect(init?.body).toBeUndefined()
  })

  it('세트 상세: GET /v0/learning/word-sets/{setId} (경로는 인코딩)', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, SET))

    expect(await fetchWordSet(API, 'ws 01', deps(fetchImpl))).toEqual(SET)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/word-sets/ws%2001')
    expect(init?.method).toBe('GET')
    expect(init?.headers).toEqual(base)
  })

  it('시도 시작: POST .../attempts, 본문 없음, 201', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, ATTEMPT))

    expect(await startWordAttempt(API, 'ws-01', deps(fetchImpl))).toEqual(ATTEMPT)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/word-sets/ws-01/attempts')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual(base)
    expect(init?.body).toBeUndefined()
  })

  it('답안: POST .../items/{itemId}/answer, 멱등 키와 choiceId 본문', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, ANSWER))

    const result = await submitWordAnswer(
      API,
      { attemptId: 'a1', itemId: 'i1', choiceId: 'i1b', idempotencyKey: 'key-1' },
      deps(fetchImpl),
    )

    expect(result).toEqual(ANSWER)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/word-attempts/a1/items/i1/answer')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ ...base, 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' })
    expect(JSON.parse(init?.body as string)).toEqual({ choiceId: 'i1b' })
  })

  it('완료: POST .../complete, 본문 없음', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, RESULT))

    expect(await completeWordAttempt(API, 'a1', deps(fetchImpl))).toEqual(RESULT)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v0/learning/word-attempts/a1/complete')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual(base)
    expect(init?.body).toBeUndefined()
  })
})

describe('인증 — 계정 토큰과 401 갱신 (KAN-255)', () => {
  it('토큰이 없으면 fetch를 부르지 않고 CLIENT_NOT_SIGNED_IN', async () => {
    const fetchImpl = vi.fn<FetchLike>()

    const error = await caught(fetchWordSets(API, deps(fetchImpl, { getToken: () => null })))

    expect(error.code).toBe('CLIENT_NOT_SIGNED_IN')
    expect(error.retryable).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('401 → 갱신 ok → 새 토큰으로 같은 요청을 한 번 재시도해 성공', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(401, envelope('UNAUTHORIZED', '인증 필요', false)))
      .mockResolvedValueOnce(jsonResponse(200, ANSWER))
    let token = 'old'
    const refreshToken = vi.fn(async () => {
      token = 'new'
      return true
    })

    const result = await submitWordAnswer(
      API,
      { attemptId: 'a1', itemId: 'i1', choiceId: 'i1b', idempotencyKey: 'key-1' },
      deps(fetchImpl, { getToken: () => token, refreshToken }),
    )

    expect(result).toEqual(ANSWER)
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [firstUrl, first] = fetchImpl.mock.calls[0]
    const [secondUrl, second] = fetchImpl.mock.calls[1]
    expect(secondUrl).toBe(firstUrl)
    expect((first?.headers as Record<string, string>).Authorization).toBe('Bearer old')
    expect((second?.headers as Record<string, string>).Authorization).toBe('Bearer new')
    // 재시도는 같은 멱등 키다 — 서버가 같은 결과를 돌려주게
    expect((second?.headers as Record<string, string>)['Idempotency-Key']).toBe('key-1')
    expect(second?.body).toBe(first?.body)
  })

  it('401 → 갱신 failed → UNAUTHENTICATED, 재시도 없음', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(401, envelope('UNAUTHORIZED', '인증 필요', false)))

    const error = await caught(fetchWordSets(API, deps(fetchImpl, { refreshToken: async () => false })))

    expect(error.code).toBe('UNAUTHENTICATED')
    expect(error.retryable).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('재시도도 401 → UNAUTHENTICATED, 갱신은 한 번만', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(401, envelope('UNAUTHORIZED', '인증 필요', false)))
    const refreshToken = vi.fn(async () => true)

    const error = await caught(fetchWordSets(API, deps(fetchImpl, { refreshToken })))

    expect(error.code).toBe('UNAUTHENTICATED')
    expect(error.retryable).toBe(false)
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('갱신은 ok인데 토큰이 비어 있으면(그 사이 로그아웃) UNAUTHENTICATED', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(401, envelope('UNAUTHORIZED', '인증 필요', false)))
    let token: string | null = 'old'
    const refreshToken = async () => {
      token = null
      return true
    }

    const error = await caught(fetchWordSets(API, deps(fetchImpl, { getToken: () => token, refreshToken })))

    expect(error.code).toBe('UNAUTHENTICATED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('첫 토큰 대기 — iOS 첫 문서 지연 (KAN-255 리뷰 P0)', () => {
  // getToken을 주입하지 않아야 기본 공급(waitForAccessToken)을 탄다
  const bridgeDeps = (fetchImpl: FetchLike): WordApiDeps => ({ fetchImpl, refreshToken: async () => false })
  const appBridge = (getAccessToken: () => string) => {
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, getAccessToken }
  }

  afterEach(() => {
    delete window.AccenturyBridge
    vi.useRealTimers()
  })

  it('처음엔 빈 토큰이어도 300ms 뒤 주입되면 그 토큰으로 목록을 부른다', async () => {
    vi.useFakeTimers()
    let token = ''
    appBridge(() => token)
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, SET_LIST))

    const pending = fetchWordSets(API, bridgeDeps(fetchImpl))
    await vi.advanceTimersByTimeAsync(300)
    token = 'acc-late'
    await vi.advanceTimersByTimeAsync(100)

    await expect(pending).resolves.toEqual(SET_LIST)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer acc-late')
  })

  it('앱 실행인데 2초 내내 빈 토큰이면 CLIENT_NOT_SIGNED_IN, 네트워크 없음', async () => {
    vi.useFakeTimers()
    appBridge(() => '')
    const fetchImpl = vi.fn<FetchLike>()

    const pending = caught(fetchWordSets(API, bridgeDeps(fetchImpl)))
    await vi.advanceTimersByTimeAsync(1_900)
    let settled = false
    void pending.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(100)

    expect((await pending).code).toBe('CLIENT_NOT_SIGNED_IN')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('브리지가 없으면(브라우저 단독) 기다리지 않고 즉시 CLIENT_NOT_SIGNED_IN', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<FetchLike>()

    // 타이머를 한 번도 진행하지 않아도 끝나야 한다
    const error = await caught(fetchWordSets(API, bridgeDeps(fetchImpl)))

    expect(error.code).toBe('CLIENT_NOT_SIGNED_IN')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('오류 해석', () => {
  it('봉투 code를 그대로 싣는다 — ITEM_ALREADY_ANSWERED도 성공으로 접지 않는다', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(409, envelope('ITEM_ALREADY_ANSWERED', '이미 답한 문항이에요', false)),
    )

    const error = await caught(
      submitWordAnswer(API, { attemptId: 'a1', itemId: 'i1', choiceId: 'i1b', idempotencyKey: 'key-2' }, deps(fetchImpl)),
    )

    expect(error.code).toBe('ITEM_ALREADY_ANSWERED')
    expect(error.message).toBe('이미 답한 문항이에요')
    expect(error.retryable).toBe(false)
  })

  it('봉투의 retryable을 따른다 (404 LEARNING_SET_NOT_FOUND)', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(404, envelope('LEARNING_SET_NOT_FOUND', '없는 세트', false)))

    const error = await caught(fetchWordSet(API, 'nope', deps(fetchImpl)))

    expect(error.code).toBe('LEARNING_SET_NOT_FOUND')
    expect(error.retryable).toBe(false)
  })

  it('네트워크 거부는 retryable true', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch')
    })

    const error = await caught(completeWordAttempt(API, 'a1', deps(fetchImpl)))

    expect(error.code).toBeNull()
    expect(error.retryable).toBe(true)
  })

  it('봉투가 없으면 상태 코드로 판정한다 (503 재시도 가능, 403 불가)', async () => {
    const noEnvelope = (status: number) => ({ ok: false, status, json: async () => { throw new SyntaxError() } }) as unknown as Response

    const retryable = await caught(fetchWordSets(API, deps(vi.fn<FetchLike>(async () => noEnvelope(503)))))
    const fatal = await caught(fetchWordSets(API, deps(vi.fn<FetchLike>(async () => noEnvelope(403)))))

    expect(retryable.code).toBeNull()
    expect(retryable.retryable).toBe(true)
    expect(fatal.retryable).toBe(false)
  })

  it('응답 모양이 계약과 다르면 retryable false', async () => {
    const wrong = vi.fn<FetchLike>(async () => jsonResponse(200, { ...ANSWER, correct: 'yes' }))
    const notJson = vi.fn<FetchLike>(
      async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError() } }) as unknown as Response,
    )
    const badChoices = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { ...SET, items: [{ ...SET.items[0], choices: [{ choiceId: 1 }] }] }),
    )

    const e1 = await caught(
      submitWordAnswer(API, { attemptId: 'a1', itemId: 'i1', choiceId: 'i1b', idempotencyKey: 'k' }, deps(wrong)),
    )
    const e2 = await caught(fetchWordSets(API, deps(notJson)))
    const e3 = await caught(fetchWordSet(API, 'ws-01', deps(badChoices)))

    for (const e of [e1, e2, e3]) {
      expect(e.code).toBeNull()
      expect(e.retryable).toBe(false)
    }
  })

  it('빈 경로 인자는 네트워크 전에 끊는다', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const error = await caught(
      submitWordAnswer(API, { attemptId: 'a1', itemId: ' ', choiceId: 'i1b', idempotencyKey: 'k' }, deps(fetchImpl)),
    )

    expect(error.code).toBe('CLIENT_MISSING_itemId')
    expect(error.retryable).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
