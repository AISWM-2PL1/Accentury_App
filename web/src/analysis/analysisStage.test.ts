import { describe, expect, it } from 'vitest'
import { ANALYSIS_STAGES, analysisStage } from './analysisStage'

describe('analysisStage — 폴링 상태에서 단계를 파생한다 (KAN-161 3단계)', () => {
  it('음성이 아직 남았으면 억양 그리기이다', () => {
    expect(analysisStage({ ready: false, completedVoice: 0, totalVoice: 5 })).toBe(1)
    expect(analysisStage({ ready: false, completedVoice: 4, totalVoice: 5 })).toBe(1)
  })

  it('음성이 전부 끝나고 결과를 기다리는 동안은 토박이 말투와 비교다', () => {
    expect(analysisStage({ ready: false, completedVoice: 5, totalVoice: 5 })).toBe(2)
  })

  it('READY면 등급 정하기이다 — 완료 수와 무관하다', () => {
    expect(analysisStage({ ready: true, completedVoice: 0, totalVoice: 5 })).toBe(3)
    expect(analysisStage({ ready: true, completedVoice: 5, totalVoice: 5 })).toBe(3)
  })

  it('음성 문항이 없는 세션은 억양 그리기에 머무르지 않는다', () => {
    // 0 < 0은 거짓이라 그냥 두면 영원히 "억양 그리기 중"인 화면이 된다
    expect(analysisStage({ ready: false, completedVoice: 0, totalVoice: 0 })).toBe(2)
  })

  it('단계 이름은 셋이고 순서가 곧 번호다', () => {
    expect(ANALYSIS_STAGES).toEqual(['억양 그리기', '토박이 말투와 비교', '등급 정하기'])
  })
})
