/** 억양 학습 피드백 순수 로직 (KAN-254 1단계) — 화면 분기·직전 대비 표기·코멘트 문장·대사 위 강조 위치. */

import { describe, expect, it } from 'vitest'
import type { IntonationAttempt, PitchFeedbackItem } from './intonationApi'
import { attemptOutcome, feedbackComment, formatDelta, scoreDelta, syllableMarks } from './intonationFeedback'

const BASE: IntonationAttempt = { attemptId: 'a', contentVersion: 'v', cardId: 'c', status: 'PROCESSING', pollAfterMs: 1000 }

const item = (word: string, raise: string | null, lower: string | null, split = false): PitchFeedbackItem => ({ word, raise, lower, split })

describe('attemptOutcome', () => {
  it('PROCESSING', () => {
    expect(attemptOutcome(BASE)).toEqual({ kind: 'processing' })
  })

  it('COMPLETED는 점수·피드백·직전 점수', () => {
    const feedback = [item('밥', '밥', null)]
    expect(attemptOutcome({ ...BASE, status: 'COMPLETED', score: 80, pitchFeedback: feedback, previousScore: 74 })).toEqual({
      kind: 'completed', score: 80, feedback, previousScore: 74,
    })
  })

  it('COMPLETED인데 score가 없으면 failed', () => {
    expect(attemptOutcome({ ...BASE, status: 'COMPLETED' })).toEqual({ kind: 'failed', code: null })
  })

  it('오독·조용함은 상태와 무관하게 따로', () => {
    expect(attemptOutcome({ ...BASE, status: 'RETRYABLE_FAILED', error: { code: 'ANALYSIS_MISREAD', retryable: true } })).toEqual({ kind: 'misread' })
    expect(attemptOutcome({ ...BASE, status: 'FAILED', error: { code: 'AUDIO_TOO_QUIET', retryable: false } })).toEqual({ kind: 'quiet' })
  })

  it('그 외 실패는 code를 넘기고, error가 없으면 null', () => {
    expect(attemptOutcome({ ...BASE, status: 'FAILED', error: { code: 'ANALYSIS_UNSCORABLE', retryable: false } })).toEqual({ kind: 'failed', code: 'ANALYSIS_UNSCORABLE' })
    expect(attemptOutcome({ ...BASE, status: 'RETRYABLE_FAILED' })).toEqual({ kind: 'failed', code: null })
  })
})

describe('직전 대비', () => {
  it('scoreDelta: 직전이 없으면 null', () => {
    expect(scoreDelta(80, null)).toBeNull()
    expect(scoreDelta(80, 74)).toBe(6)
  })

  it('formatDelta: +, U+2212 마이너스, ±0', () => {
    expect(formatDelta(6)).toBe('+6')
    expect(formatDelta(-3)).toBe('−3')
    expect(formatDelta(-3)).not.toContain('-')
    expect(formatDelta(0)).toBe('±0')
  })
})

describe('feedbackComment', () => {
  it.each([
    [item('밥', null, null, true), '밥: 경남 화자마다 높이는 음절이 달라요. 편하게 말해도 괜찮아요'],
    [item('뭇나', '뭇', '나'), "뭇나: '뭇' 음절을 더 높이고 '나' 음절은 낮춰 보세요"],
    [item('뭇나', '뭇', null), "뭇나: '뭇' 음절을 더 높여 보세요"],
    [item('뭇나', null, '나'), "뭇나: '나' 음절을 낮춰 보세요"],
    [item('뭇나', null, null), '뭇나: 가장 높은 음절은 맞았어요. 나머지 높낮이를 가이드 곡선에 맞춰 보세요'],
  ])('%o', (input, expected) => {
    expect(feedbackComment(input)).toBe(expected)
  })
})

describe('syllableMarks', () => {
  it('어절 위치 + 글자 위치, commentNo는 항목 번호', () => {
    expect(syllableMarks('밥 뭇나', [item('밥', null, null, true), item('뭇나', '뭇', '나')])).toEqual([
      { index: 2, mark: 'raise', commentNo: 2 },
      { index: 3, mark: 'lower', commentNo: 2 },
    ])
  })

  it('같은 어절이 반복되면 직전 위치 뒤에서 찾는다', () => {
    expect(syllableMarks('가자 가자', [item('가자', '가', null), item('가자', null, '자')])).toEqual([
      { index: 0, mark: 'raise', commentNo: 1 },
      { index: 4, mark: 'lower', commentNo: 2 },
    ])
  })

  it('어절·글자를 못 찾으면 그 표시만 건너뛴다', () => {
    expect(syllableMarks('밥 뭇나', [item('없음', '없', null), item('뭇나', '꽥', '나')])).toEqual([
      { index: 3, mark: 'lower', commentNo: 2 },
    ])
  })

  it('raise와 lower가 같은 글자면 raise만', () => {
    expect(syllableMarks('뭇나', [item('뭇나', '뭇', '뭇')])).toEqual([{ index: 0, mark: 'raise', commentNo: 1 }])
  })
})
