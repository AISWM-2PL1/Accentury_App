/**
 * 객관식 답 → 멱등 키 (KAN-13의 규칙을 KAN-255에서 꺼냈다).
 *
 * ## 멱등 키의 수명 (AC: 중복 생성 없는 재시도)
 *
 * 키는 "지금 고른 답" 단위로 산다. 같은 답의 재시도는 같은 키로 나가고(서버가 재전송으로
 * 알아본다), 실패 후 답을 바꾸면 새 키다 — 같은 키로 다른 답을 보내면 서버가 400으로
 * 거절하기 때문이다(§3.5). 직전 답 하나만 기억하므로 A → B → A로 돌아오면 A도 새 키다.
 *
 * 레벨테스트 어휘 문항과 단어 학습 치환 문항(W-3)이 같은 규칙을 써야 해서 훅으로 뺐다.
 * 반환 함수는 제출 시점에만 부른다 — 키는 렌더에 안 보이므로 상태가 아니라 ref다.
 */

import { useCallback, useRef } from 'react'
import { newIdempotencyKey } from './idempotencyKey'

export function useChoiceIdempotencyKey(): (choiceId: string) => string {
  const last = useRef<{ choiceId: string; key: string } | null>(null)
  return useCallback((choiceId: string) => {
    if (last.current?.choiceId !== choiceId) {
      last.current = { choiceId, key: newIdempotencyKey() }
    }
    return last.current.key
  }, [])
}
