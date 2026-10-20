/**
 * 사투리 번역 API 클라이언트 (KAN-256 2단계) — 서버 KAN-266의 `POST /v0/translations`(명세서 §3.18).
 *
 * 인증·401 갱신·오류 봉투 처리는 학습 API와 한 벌이다 — `learning/wordApi.ts`의 [request]를 그대로 쓰고
 * 실패도 같은 [WordLearningError]로 던진다. 토큰·갱신 규칙(webview-bridge.md §11)이 계정 API 전체에
 * 하나여야 해서다. 오류 code(봉투): 400 `VALIDATION_FAILED`, 401 → 갱신 규칙 → `UNAUTHENTICATED`,
 * 422 `TRANSLATION_TOO_LONG`·`TRANSLATION_REJECTED`, 503 `TRANSLATION_UNAVAILABLE`(retryable).
 * 토큰 없음은 `CLIENT_NOT_SIGNED_IN`, 네트워크 실패는 code 없는 retryable이다.
 */

import { WordLearningError, hasFields, request, type WordApiDeps } from '../learning/wordApi'

export const TRANSLATION_TOO_LONG = 'TRANSLATION_TOO_LONG'
export const TRANSLATION_REJECTED = 'TRANSLATION_REJECTED'
export const TRANSLATION_UNAVAILABLE = 'TRANSLATION_UNAVAILABLE'
export const VALIDATION_FAILED = 'VALIDATION_FAILED'

/** 표준어 문장 하나 → 사투리 문장 하나. 200 본문 `{"dialect": string}` */
export async function translate(apiBase: string, text: string, deps: WordApiDeps = {}): Promise<string> {
  const body = await request(apiBase, '/v0/translations', 'POST', { json: { text } }, deps)
  // 빈 문장은 성공으로 받지 않는다 — 결과 자리에 아무것도 없는 「성공」을 그리게 된다.
  // 다시 받아도 같은 모양이라 재시도하지 않는다 (`shapeError`와 같은 판정, 문구만 번역기 것)
  if (!hasFields(body, { dialect: 'string' }) || (body.dialect as string).trim() === '') {
    throw new WordLearningError('번역 결과를 해석할 수 없어요', null, false)
  }
  return body.dialect as string
}
