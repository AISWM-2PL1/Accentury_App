/**
 * 단어 학습 API 클라이언트 (KAN-255 1단계) — 서버 KAN-265의 `/v0/learning/word-*` 다섯 경로.
 * 타입은 서버 DTO(`Accentury_Server` `backend/.../learning/Word*Response.java`)를 그대로 옮겼다.
 *
 * ## 인증은 세션 토큰이 아니라 계정 Access 토큰이다
 *
 * 학습 API는 전부 계정 Bearer가 필수다. 레벨테스트 클라이언트(`submitVocabAnswer` 등)처럼
 * 호출자가 토큰을 들고 오지 않고 이 모듈이 브리지에서 직접 읽는 이유는 **401 갱신 재시도**
 * 때문이다: 갱신 뒤에는 새 토큰을 다시 읽어야 하는데, 값으로 받아서는 그걸 할 수 없다.
 * 규칙(webview-bridge.md §11):
 *
 * - 토큰이 없으면(로그인 안 됨) 네트워크 전에 `CLIENT_NOT_SIGNED_IN`으로 끊는다.
 * - 401이면 갱신을 **한 번** 요청하고, 성공하면 토큰을 다시 읽어 같은 요청을 한 번 재시도한다.
 *   갱신 실패·재시도도 401이면 `UNAUTHENTICATED`. 둘 다 재시도로 풀리지 않아 retryable false다.
 *
 * ## 실패는 전부 [WordLearningError]
 *
 * 구조는 `VocabSubmitError`와 같다 — 분기는 봉투(§2.3)의 `code`로 하고, 봉투가 없으면 상태
 * 코드로 재시도 여부를 판정한다(`net/retryableStatus`).
 *
 * **`ITEM_ALREADY_ANSWERED`를 성공으로 접지 않는다.** 레벨테스트는 답안이 서버에 있기만 하면
 * 됐지만, 단어 학습은 정오·정답·해설을 화면에 보여야 해서 결과 본문 없는 성공은 쓸 데가 없다.
 * 응답 유실 뒤 재시도는 **같은 멱등 키로** 보내면 서버가 같은 결과를 돌려준다.
 */

import { getAccessToken, refreshAccessToken, waitForAccessToken } from '../bridge/bridge'
import { readErrorEnvelope } from '../net/errorEnvelope'
import { isRetryableStatus } from '../net/retryableStatus'
import type { FetchLike } from '../progress/fetchTestDefinition'

const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

// ── 서버 DTO ────────────────────────────────────────────────────────────

/** `WordSetListResponse.Summary` */
export interface WordSetSummary {
  setId: string
  seq: number
  level: number
  category: string
  title: string
  cardCount: number
  itemCount: number
}

/** `GET /v0/learning/word-sets` — 세트는 seq 오름차순 */
export interface WordSetList {
  contentVersion: string
  sets: WordSetSummary[]
}

/** `WordLearningDefinition.Card` — 표준어와 사투리 한 쌍 */
export interface WordCard {
  cardId: string
  standard: string
  dialect: string
}

/** `WordLearningDefinition.Choice` */
export interface WordChoice {
  choiceId: string
  text: string
}

/** `WordSetResponse.Item` — 정답이 없다 (채점은 서버가 한다) */
export interface WordItem {
  itemId: string
  seq: number
  cardId: string
  prompt: string
  choices: WordChoice[]
}

/** `GET /v0/learning/word-sets/{setId}` */
export interface WordSet {
  contentVersion: string
  setId: string
  seq: number
  level: number
  category: string
  title: string
  cards: WordCard[]
  items: WordItem[]
}

/** `POST /v0/learning/word-sets/{setId}/attempts` (201) */
export interface WordAttempt {
  attemptId: string
  contentVersion: string
  setId: string
  itemCount: number
  /** ISO-8601 */
  startedAt: string
}

/** `POST /v0/learning/word-attempts/{attemptId}/items/{itemId}/answer` */
export interface WordAnswerResult {
  correct: boolean
  correctChoiceId: string
  correctText: string
  explanation: string
  answeredCount: number
  itemCount: number
}

/** `WordAttemptResultResponse.WrongItem` */
export interface WordWrongItem {
  itemId: string
  cardId: string
  prompt: string
  chosenChoiceId: string
  chosenText: string
  correctChoiceId: string
  correctText: string
  explanation: string
}

/** `POST /v0/learning/word-attempts/{attemptId}/complete` */
export interface WordAttemptResult {
  attemptId: string
  contentVersion: string
  setId: string
  itemCount: number
  correctCount: number
  accuracyPercent: number
  wrongItems: WordWrongItem[]
  /** ISO-8601 */
  completedAt: string
}

// ── 오류 ────────────────────────────────────────────────────────────────

/** 로그인 안 됨 — 계정 토큰이 없어 요청하지 않았다. 화면은 로그인 안내로 간다 */
export const CLIENT_NOT_SIGNED_IN = 'CLIENT_NOT_SIGNED_IN'
/** 토큰 갱신 실패 또는 갱신 뒤에도 401 */
export const UNAUTHENTICATED = 'UNAUTHENTICATED'

/** 봉투의 code·retryable을 실은 실패. code는 봉투를 못 읽었으면 null이다 (`VocabSubmitError`와 같은 구조) */
export class WordLearningError extends Error {
  readonly code: string | null
  readonly retryable: boolean

  constructor(message: string, code: string | null, retryable: boolean) {
    super(message)
    this.name = 'WordLearningError'
    this.code = code
    this.retryable = retryable
  }
}

/** 주입 지점. 기본값은 실물 fetch와 브리지 래퍼다 */
export interface WordApiDeps {
  fetchImpl?: FetchLike
  /**
   * 계정 Access 토큰. 없으면 null. Promise도 받는다 — 기본값의 첫 확보가 [waitForAccessToken]이라서다.
   * 주입하면 첫 확보와 갱신 뒤 재읽기 둘 다 이것을 쓴다
   */
  getToken?: () => string | null | Promise<string | null>
  /** 토큰 갱신. 갱신됐으면 true */
  refreshToken?: () => Promise<boolean>
}

// ── 다섯 경로 ───────────────────────────────────────────────────────────

/** 세트 목록 (W-1) */
export async function fetchWordSets(apiBase: string, deps: WordApiDeps = {}): Promise<WordSetList> {
  const body = await request(apiBase, '/v0/learning/word-sets', 'GET', {}, deps)
  if (!isWordSetList(body)) throw shapeError()
  return body
}

/** 세트 상세 — 카드와 문항, 정답 없음 (W-2·W-3). 404 `LEARNING_SET_NOT_FOUND` */
export async function fetchWordSet(apiBase: string, setId: string, deps: WordApiDeps = {}): Promise<WordSet> {
  requireValues({ setId })
  const body = await request(apiBase, `/v0/learning/word-sets/${encodeURIComponent(setId)}`, 'GET', {}, deps)
  if (!isWordSet(body)) throw shapeError()
  return body
}

/** 시도 시작 (본문 없음, 201) */
export async function startWordAttempt(apiBase: string, setId: string, deps: WordApiDeps = {}): Promise<WordAttempt> {
  requireValues({ setId })
  const body = await request(apiBase, `/v0/learning/word-sets/${encodeURIComponent(setId)}/attempts`, 'POST', {}, deps)
  if (!isWordAttempt(body)) throw shapeError()
  return body
}

/** 답안 하나. 재시도 시 반드시 같은 `idempotencyKey`를 다시 넘긴다 */
export interface WordAnswerSubmission {
  attemptId: string
  itemId: string
  choiceId: string
  idempotencyKey: string
}

/**
 * 답안 제출과 채점 (W-4). `ITEM_ALREADY_ANSWERED`(409)도 오류로 던진다 — 머리 주석.
 * 그 밖의 코드: 400 `VALIDATION_FAILED`, 403 `LEARNING_ATTEMPT_FORBIDDEN`, 404
 * `LEARNING_ATTEMPT_NOT_FOUND`, 409 `LEARNING_ATTEMPT_COMPLETED`, 422 `ITEM_NOT_IN_VERSION`, 429.
 */
export async function submitWordAnswer(
  apiBase: string,
  submission: WordAnswerSubmission,
  deps: WordApiDeps = {},
): Promise<WordAnswerResult> {
  const { attemptId, itemId, choiceId, idempotencyKey } = submission
  requireValues({ attemptId, itemId, choiceId, idempotencyKey })
  const path =
    `/v0/learning/word-attempts/${encodeURIComponent(attemptId)}` +
    `/items/${encodeURIComponent(itemId)}/answer`
  const body = await request(apiBase, path, 'POST', { json: { choiceId }, idempotencyKey }, deps)
  if (!isWordAnswerResult(body)) throw shapeError()
  return body
}

/** 세트 완료 — 정답률과 오답 목록 (W-5). 멱등. 422 `LEARNING_ATTEMPT_INCOMPLETE` */
export async function completeWordAttempt(
  apiBase: string,
  attemptId: string,
  deps: WordApiDeps = {},
): Promise<WordAttemptResult> {
  requireValues({ attemptId })
  const path = `/v0/learning/word-attempts/${encodeURIComponent(attemptId)}/complete`
  const body = await request(apiBase, path, 'POST', {}, deps)
  if (!isWordAttemptResult(body)) throw shapeError()
  return body
}

// ── 공통 요청 ───────────────────────────────────────────────────────────

/**
 * 토큰 확보 → 요청 → 401이면 갱신 1회 후 재시도 → 오류 봉투 해석. 성공이면 파싱한 본문을 준다.
 */
async function request(
  apiBase: string,
  path: string,
  method: 'GET' | 'POST',
  options: { json?: unknown; idempotencyKey?: string },
  deps: WordApiDeps,
): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? browserFetch
  // 첫 확보만 기다린다 (KAN-255 리뷰 P0): iOS는 첫 문서에서 `""`를 먼저 밀고 Keychain을 읽은 뒤
  // 실제 토큰을 민다(webview-bridge §6·§11). 갱신 뒤 재읽기는 기다리지 않는다 — iOS가 'ok'보다
  // 새 토큰을 먼저 밀므로 그때 null이면 정말 없는 것이다.
  const firstToken = deps.getToken ?? (() => waitForAccessToken())
  const readToken = deps.getToken ?? getAccessToken
  const refreshToken = deps.refreshToken ?? (() => refreshAccessToken())

  const token = await firstToken()
  if (token === null) {
    throw new WordLearningError('로그인하면 단어 학습을 할 수 있어요', CLIENT_NOT_SIGNED_IN, false)
  }

  const url = `${apiBase.replace(/\/+$/, '')}${path}`
  const send = async (bearer: string): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${bearer}` }
    if (options.json !== undefined) headers['Content-Type'] = 'application/json'
    if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey
    try {
      return await fetchImpl(url, {
        method,
        headers,
        body: options.json === undefined ? undefined : JSON.stringify(options.json),
      })
    } catch {
      // 서버에 닿았는지 모르는 상태다. 답안 제출은 같은 멱등 키 재시도가 무해하고, 나머지는
      // 조회·멱등 완료·새 시도라 다시 보내도 잃는 것이 없다.
      throw new WordLearningError('네트워크 오류로 요청하지 못했어요', null, true)
    }
  }

  let response = await send(token)
  if (response.status === 401) {
    // 갱신은 한 번만 — 재시도도 401이면 토큰 문제가 아니라 계정 쪽 사정이라 반복해도 같다.
    const refreshed = await refreshToken()
    const renewed = refreshed ? await readToken() : null
    if (renewed === null) throw unauthenticated()
    response = await send(renewed)
    if (response.status === 401) throw unauthenticated()
  }

  if (response.ok) {
    try {
      return await response.json()
    } catch {
      throw shapeError()
    }
  }

  const envelope = await readErrorEnvelope(response)
  if (envelope !== null) throw new WordLearningError(envelope.message, envelope.code, envelope.retryable)
  throw new WordLearningError(
    `요청을 처리하지 못했어요 (HTTP ${response.status})`,
    null,
    isRetryableStatus(response.status),
  )
}

function unauthenticated(): WordLearningError {
  return new WordLearningError('로그인이 만료됐어요. 다시 로그인해 주세요', UNAUTHENTICATED, false)
}

/** 계약과 다른 응답 — 다시 받아도 같은 모양이라 재시도하지 않는다 */
function shapeError(): WordLearningError {
  return new WordLearningError('학습 정보를 해석할 수 없어요', null, false)
}

/**
 * 빈 경로 인자는 네트워크 전에 끊는다 — `submitVocabAnswer`와 같은 가드. 사용자 문구와 진단을
 * 나누고, 어느 값이 비었는지는 code와 콘솔에 남긴다.
 */
function requireValues(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value.trim() === '') {
      console.error(`[words] 단어 학습 요청에 필요한 값이 비어 있습니다: ${name}`)
      throw new WordLearningError('단어 학습을 진행할 수 없어요. 앱을 다시 시작해 주세요', `CLIENT_MISSING_${name}`, false)
    }
  }
}

// ── 응답 모양 검증 (필수 필드 타입만) ─────────────────────────────────────

type FieldType = 'string' | 'number' | 'boolean'

function hasFields(value: unknown, fields: Record<string, FieldType>): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return Object.entries(fields).every(([key, type]) => typeof record[key] === type)
}

function isArrayOf(value: unknown, fields: Record<string, FieldType>, extra: (v: Record<string, unknown>) => boolean = () => true): boolean {
  return Array.isArray(value) && value.every((v) => hasFields(v, fields) && extra(v))
}

const SUMMARY_FIELDS = {
  setId: 'string', seq: 'number', level: 'number', category: 'string', title: 'string',
  cardCount: 'number', itemCount: 'number',
} as const satisfies Record<string, FieldType>

function isWordSetList(v: unknown): v is WordSetList {
  return hasFields(v, { contentVersion: 'string' }) && isArrayOf(v.sets, SUMMARY_FIELDS)
}

function isWordSet(v: unknown): v is WordSet {
  return (
    hasFields(v, { contentVersion: 'string', setId: 'string', seq: 'number', level: 'number', category: 'string', title: 'string' }) &&
    isArrayOf(v.cards, { cardId: 'string', standard: 'string', dialect: 'string' }) &&
    isArrayOf(
      v.items,
      { itemId: 'string', seq: 'number', cardId: 'string', prompt: 'string' },
      (item) => isArrayOf(item.choices, { choiceId: 'string', text: 'string' }),
    )
  )
}

function isWordAttempt(v: unknown): v is WordAttempt {
  return hasFields(v, { attemptId: 'string', contentVersion: 'string', setId: 'string', itemCount: 'number', startedAt: 'string' })
}

function isWordAnswerResult(v: unknown): v is WordAnswerResult {
  return hasFields(v, {
    correct: 'boolean', correctChoiceId: 'string', correctText: 'string', explanation: 'string',
    answeredCount: 'number', itemCount: 'number',
  })
}

function isWordAttemptResult(v: unknown): v is WordAttemptResult {
  return (
    hasFields(v, {
      attemptId: 'string', contentVersion: 'string', setId: 'string', itemCount: 'number',
      correctCount: 'number', accuracyPercent: 'number', completedAt: 'string',
    }) &&
    isArrayOf(v.wrongItems, {
      itemId: 'string', cardId: 'string', prompt: 'string', chosenChoiceId: 'string', chosenText: 'string',
      correctChoiceId: 'string', correctText: 'string', explanation: 'string',
    })
  )
}
