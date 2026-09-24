import { describe, expect, it } from 'vitest'
import { isSessionExitCode } from './sessionExit'

describe('isSessionExitCode (KAN-237)', () => {
  it('세션 종료 코드 둘만 출구로 본다', () => {
    expect(isSessionExitCode('SESSION_EXPIRED')).toBe(true)
    expect(isSessionExitCode('SESSION_FORBIDDEN')).toBe(true)
  })

  it('다른 코드·코드 없음은 출구가 아니다 — 확정되지 않은 실패로 시험 밖에 내보내지 않는다', () => {
    expect(isSessionExitCode('AUDIO_FORMAT_UNSUPPORTED')).toBe(false)
    expect(isSessionExitCode(null)).toBe(false)
    expect(isSessionExitCode(undefined)).toBe(false)
  })
})
