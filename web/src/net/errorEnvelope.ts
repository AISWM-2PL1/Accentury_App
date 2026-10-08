/**
 * 오류 봉투(§2.3) 읽기 — `code`·`message`·`retryable` 셋만 읽는 좁은 판 (KAN-255에서
 * `progress/submitVocabAnswer`의 지역 함수를 옮겨 왔다).
 *
 * 단어 학습 API 클라이언트(`learning/wordApi`)가 두 번째 사용처가 되면서 어휘 제출이 소유할
 * 이유가 없어졌다 (`net/idempotencyKey`를 꺼낸 것과 같은 이유).
 *
 * `analysis/errorEnvelope`는 `retryAfterMs`·문항 목록까지 읽는 넓은 판이라 일부러 합치지 않았다 —
 * 합치는 기준은 그쪽 머리 주석. `result/fetchResult`에도 같은 지역 사본이 남아 있다 (이번엔 안 옮김).
 */

/** 오류 봉투(§2.3)의 클라이언트 관심 부분. correlationId 등 나머지는 읽지 않는다 */
export interface ErrorEnvelope {
  code: string
  message: string
  retryable: boolean
}

/** 본문을 봉투로 읽어 본다. JSON이 아니거나 봉투 모양이 아니면 null — 상태 코드 폴백으로 간다 */
export async function readErrorEnvelope(response: Response): Promise<ErrorEnvelope | null> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { code, message, retryable } = parsed as Record<string, unknown>
  if (typeof code !== 'string' || typeof message !== 'string' || typeof retryable !== 'boolean') return null
  return { code, message, retryable }
}
