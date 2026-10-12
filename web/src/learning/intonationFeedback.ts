/**
 * 억양 학습 피드백 순수 로직 (KAN-254 1단계) — 채점 응답(KAN-267)을 화면이 고를 분기·코멘트 문장·대사 위
 * 강조 위치로 바꾼다. 코멘트 문구는 서버가 아니라 클라이언트가 만든다(2026-10-12 결정).
 */

import type { IntonationAttempt, PitchFeedbackItem } from './intonationApi'

export type AttemptOutcome =
  | { kind: 'processing' }
  | { kind: 'completed'; score: number; feedback: PitchFeedbackItem[]; previousScore: number | null }
  | { kind: 'misread' }
  | { kind: 'quiet' }
  | { kind: 'failed'; code: string | null }

/** 화면 분기. 오독·조용함만 따로 문구를 주고 나머지 실패는 code만 넘긴다(출구는 모두 [다시 녹음]). */
export function attemptOutcome(a: IntonationAttempt): AttemptOutcome {
  if (a.status === 'PROCESSING') return { kind: 'processing' }
  if (a.status === 'COMPLETED') {
    // 모양 검증을 통과했다면 score는 있다 — 직접 만든 값이 들어와도 빈 피드백 화면을 그리지 않게 막는다
    if (a.score === undefined) return { kind: 'failed', code: null }
    return { kind: 'completed', score: a.score, feedback: a.pitchFeedback ?? [], previousScore: a.previousScore ?? null }
  }
  const code = a.error?.code ?? null
  if (code === 'ANALYSIS_MISREAD') return { kind: 'misread' }
  if (code === 'AUDIO_TOO_QUIET') return { kind: 'quiet' }
  return { kind: 'failed', code }
}

export function scoreDelta(score: number, previousScore: number | null): number | null {
  return previousScore === null ? null : score - previousScore
}

/** 직전 대비. 색 없이 부호만으로 읽히게(NFR-US-03) — 음수는 하이픈이 아닌 U+2212 */
export function formatDelta(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${-n}`
  return '±0'
}

// 음절 글자 뒤 조사(을/를)를 받침으로 고르지 않으려고 '{글자}' 음절 꼴로 쓴다
export function feedbackComment(item: PitchFeedbackItem): string {
  const { word, raise, lower } = item
  if (item.split) return `${word}: 경남 화자마다 높이는 음절이 달라요. 편하게 말해도 괜찮아요`
  if (raise !== null && lower !== null) return `${word}: '${raise}' 음절을 더 높이고 '${lower}' 음절은 낮춰 보세요`
  if (raise !== null) return `${word}: '${raise}' 음절을 더 높여 보세요`
  if (lower !== null) return `${word}: '${lower}' 음절을 낮춰 보세요`
  return `${word}: 가장 높은 음절은 맞았어요. 나머지 높낮이를 가이드 곡선에 맞춰 보세요`
}

export interface SyllableMark {
  /** dialect 문자열 안의 인덱스 */
  index: number
  mark: 'raise' | 'lower'
  /** 코멘트 목록 번호 (1부터, pitchFeedback 순서) */
  commentNo: number
}

/**
 * 대사 위 강조 위치 (3단계에서 씀). 서버가 인덱스 대신 글자를 주므로(2026-10-10 서버 결정) 여기서 찾는다.
 * 같은 어절이 두 번 나오는 대사를 위해 어절은 직전에 찾은 위치 뒤에서부터 찾는다. 못 찾으면 그 표시만 건너뛴다.
 */
export function syllableMarks(dialect: string, feedback: PitchFeedbackItem[]): SyllableMark[] {
  const marks: SyllableMark[] = []
  let from = 0
  feedback.forEach((item, i) => {
    const start = dialect.indexOf(item.word, from)
    if (start < 0) return
    from = start + item.word.length
    const add = (syllable: string | null, mark: SyllableMark['mark']) => {
      const offset = syllable === null ? -1 : item.word.indexOf(syllable)
      if (offset >= 0) marks.push({ index: start + offset, mark, commentNo: i + 1 })
    }
    add(item.raise, 'raise')
    // 같은 글자를 올리고 내리라는 표시는 모순이라 raise만 남긴다
    if (item.lower !== item.raise) add(item.lower, 'lower')
  })
  return marks
}
