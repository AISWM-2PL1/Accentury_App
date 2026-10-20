import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChoiceIdempotencyKey } from './useChoiceIdempotencyKey'

describe('useChoiceIdempotencyKey (KAN-255)', () => {
  it('같은 답은 같은 키, 답이 바뀌면 새 키 — 직전 답 하나만 기억한다', () => {
    const { result } = renderHook(() => useChoiceIdempotencyKey())
    const keyFor = result.current

    const a1 = keyFor('a')
    expect(keyFor('a')).toBe(a1)

    const b = keyFor('b')
    expect(b).not.toBe(a1)

    // A → B → A: 직전 답(B)과 다르므로 A도 새 키다 (VocabularyItemScreen의 기존 규칙 그대로)
    const a2 = keyFor('a')
    expect(a2).not.toBe(a1)
    expect(a2).not.toBe(b)
  })
})
