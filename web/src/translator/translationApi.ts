/**
 * 사투리 번역 API 클라이언트 (KAN-256 2단계) — 서버 KAN-266의 `POST /v0/translations`(명세서 §3.18).
 *
 * 인증·401 갱신·오류 봉투 처리는 학습 API와 한 벌이다 — `learning/wordApi.ts`의 [request]를 그대로 쓰고
 * 실패도 같은 [WordLearningError]로 던진다. 토큰·갱신 규칙(webview-bridge.md §11)이 계정 API 전체에
 * 하나여야 해서다. 오류 code(봉투): 400 `VALIDATION_FAILED`, 401 → 갱신 규칙 → `UNAUTHENTICATED`,
 * 422 `TRANSLATION_TOO_LONG`·`TRANSLATION_REJECTED`, 503 `TRANSLATION_UNAVAILABLE`(retryable).
 * 토큰 없음은 `CLIENT_NOT_SIGNED_IN`, 네트워크 실패는 code 없는 retryable이다.
 *
 * KAN-317: 방향을 고른다. 서버 KAN-316이 본문 `direction`(`toDialect`|`toStandard`, 생략 = toDialect)을 받고
 * 200 본문의 결과 필드를 방향마다 하나만 준다 — toDialect `dialect`, toStandard `standard`. 오류 code는 방향과
 * 무관하고 하루 한도도 두 방향 합산이다. KAN-316 전 서버는 `direction`을 모르고 무시해 늘 `{dialect}`만 준다.
 * toStandard에 그 응답이 오면 표준어로 바꾸지 못한 것이라 사투리 문장을 결과로 그리면 안 된다 —
 * 클라이언트 code `TRANSLATION_DIRECTION_UNSUPPORTED`(재시도 불가)로 던진다. 다시 보내도 같은 서버다.
 */

import { WordLearningError, hasFields, request, type WordApiDeps } from '../learning/wordApi'

export const TRANSLATION_TOO_LONG = 'TRANSLATION_TOO_LONG'
export const TRANSLATION_REJECTED = 'TRANSLATION_REJECTED'
export const TRANSLATION_UNAVAILABLE = 'TRANSLATION_UNAVAILABLE'
export const VALIDATION_FAILED = 'VALIDATION_FAILED'
/** 429 하루 한도(계정당 5건, 두 방향 합산). 서버 `ErrorCode.TRANSLATION_DAILY_LIMIT_EXCEEDED`, 재시도 불가 */
export const TRANSLATION_DAILY_LIMIT_EXCEEDED = 'TRANSLATION_DAILY_LIMIT_EXCEEDED'
/** 서버 code가 아니다 — 구 서버가 toStandard에 `{dialect}`만 줬을 때 이 클라이언트가 붙인다 */
export const TRANSLATION_DIRECTION_UNSUPPORTED = 'TRANSLATION_DIRECTION_UNSUPPORTED'
export const DIRECTION_UNSUPPORTED_MESSAGE = '지금은 표준어로 바꾸기를 쓸 수 없어요'

export type TranslationDirection = 'toDialect' | 'toStandard'

/**
 * 번역 결과. [remaining]은 이 번역 뒤 오늘 남은 성공 번역 수(서버 0~4, 2026-10-15 결정)이고, 응답에 0 이상 정수가 없으면
 * null이다 — `remaining`을 싣지 않던 서버의 응답이다. 화면은 null이면 「오늘 n번 남았어요」를 숨긴다(KAN-347 6-4).
 */
export interface TranslationOutcome {
  result: string
  remaining: number | null
}

/** 문장 하나를 [direction] 쪽으로 바꾼다. 200 본문 `{"dialect": string, "remaining"?: number}` 또는 `{"standard": …}` */
export async function translate(
  apiBase: string,
  text: string,
  direction: TranslationDirection,
  deps: WordApiDeps = {},
): Promise<TranslationOutcome> {
  const body = await request(apiBase, '/v0/translations', 'POST', { json: { text, direction }, allowGuest: true }, deps)
  const field = direction === 'toDialect' ? 'dialect' : 'standard'
  if (direction === 'toStandard' && !hasFields(body, { standard: 'string' }) && hasFields(body, { dialect: 'string' })) {
    throw new WordLearningError(DIRECTION_UNSUPPORTED_MESSAGE, TRANSLATION_DIRECTION_UNSUPPORTED, false)
  }
  // 빈 문장은 성공으로 받지 않는다 — 결과 자리에 아무것도 없는 「성공」을 그리게 된다.
  // 다시 받아도 같은 모양이라 재시도하지 않는다 (`shapeError`와 같은 판정, 문구만 번역기 것)
  if (!hasFields(body, { [field]: 'string' }) || (body[field] as string).trim() === '') {
    throw new WordLearningError('번역 결과를 해석할 수 없어요', null, false)
  }
  const remaining = body.remaining
  return {
    result: body[field] as string,
    remaining: typeof remaining === 'number' && Number.isInteger(remaining) && remaining >= 0 ? remaining : null,
  }
}

/**
 * 번역 결과 신고 (KAN-331·KAN-344, 서버 KAN-343 `POST /v0/translations/reports`, 명세서 §3.22). 번역 결과는 외부 LLM이
 * 만들어 부적절한 문장이 나올 수 있다 — 본 사람이 알릴 길이 있어야 한다(App Store 지침 1.2). 서버에는 신고가 가리킬 번역
 * 기록이 없어 화면이 그 요청·응답 값을 그대로 다시 싣는다(text 1~100자, result 1~300자). 게스트도 신고할 수 있다(서버
 * `allowGuest`). 201 본문 `{reportId}`. 오류는 [translate]와 같은 [WordLearningError]다(400·401·429).
 */
export async function reportTranslation(
  apiBase: string,
  report: { direction: TranslationDirection; text: string; result: string },
  deps: WordApiDeps = {},
): Promise<string> {
  const body = await request(apiBase, '/v0/translations/reports', 'POST', { json: report, allowGuest: true }, deps)
  if (!hasFields(body, { reportId: 'string' })) throw new WordLearningError('신고 결과를 해석할 수 없어요', null, false)
  return body.reportId as string
}
