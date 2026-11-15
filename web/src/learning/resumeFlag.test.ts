import { afterEach, describe, expect, it, vi } from 'vitest'
import { markResumeLearning, takeResumeLearning } from './resumeFlag'

describe('홈 [이어가기] 일회성 표식 (KAN-347 3-6)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('표식은 한 번만 읽힌다', () => {
    expect(takeResumeLearning()).toBe(false)
    markResumeLearning()
    expect(takeResumeLearning()).toBe(true)
    expect(takeResumeLearning()).toBe(false)
  })

  it('저장소 접근이 던져도 조용히 false다 — 학습 탭은 지도에 머문다', () => {
    const proto = Object.getPrototypeOf(sessionStorage) as Storage
    vi.spyOn(proto, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(proto, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => markResumeLearning()).not.toThrow()
    expect(takeResumeLearning()).toBe(false)
  })
})
