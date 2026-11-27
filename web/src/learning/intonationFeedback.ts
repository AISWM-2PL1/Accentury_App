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

/** 직전 대비 「▲9」「▼3」「±0」 (시안 s-19·s-07-A). 색 없이 기호만으로 오르내림이 읽힌다(NFR-US-03) */
export function formatDelta(n: number): string {
  if (n > 0) return `▲${n}`
  if (n < 0) return `▼${-n}`
  return '±0'
}

/** 증감의 스크린 리더 문장. 첫 시도(직전 없음)면 「첫 기록」 */
export function deltaDescription(score: number, previousScore: number | null): string {
  if (previousScore === null) return '첫 기록'
  const d = score - previousScore
  if (d === 0) return `지난번 ${previousScore}점과 같음`
  return `지난번 ${previousScore}점보다 ${Math.abs(d)}점 ${d > 0 ? '상승' : '하락'}`
}

// 음절 글자 뒤 조사(을/를)를 받침으로 고르지 않으려고 「글자」 음절 꼴로 쓴다
/** 코멘트에서 어절 이름을 뺀 조언 한 문장 — 성적표 「다시 연습할 대사」 카드의 첫 코멘트 줄 (시안 s-07-A) */
export function feedbackAdvice(item: PitchFeedbackItem): string {
  const { raise, lower } = item
  if (item.split) return '경남 화자마다 높이는 음절이 달라요. 편하게 말해도 괜찮아요'
  if (raise !== null && lower !== null) return `「${raise}」 음절을 더 높이고 「${lower}」 음절은 낮춰 보세요`
  if (raise !== null) return `「${raise}」 음절을 더 높여 보세요`
  if (lower !== null) return `「${lower}」 음절을 낮춰 보세요`
  return '가장 높은 음절은 맞았어요. 나머지 높낮이를 가이드 곡선에 맞춰 보세요'
}

export function feedbackComment(item: PitchFeedbackItem): string {
  return `${item.word}: ${feedbackAdvice(item)}`
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

// ── 억양 성적표 (KAN-347 5-4, 확정된 결정 「세트 점수」「성적표 별」 2026-11-16) ──────────────────

/** 「이번 스탬프」 별 경계 — KAN-359 구간 요약 `starThresholds`가 없을 때의 앱 상수 (5-6) */
export const STAR_THRESHOLDS: readonly number[] = [30, 70]

/** 점수 → 별 1~3. 첫 경계 미만 ★1, 둘째 미만 ★2, 그 이상 ★3 (0점이어도 ★1). 경계가 두 개가 아니면 앱 상수 */
export function starsForScore(score: number, thresholds?: readonly number[] | null): number {
  const [low, high] = thresholds?.length === 2 ? thresholds : STAR_THRESHOLDS
  return score < low ? 1 : score < high ? 2 : 3
}

/**
 * 성적표 점수 = 이번에 녹음한 대사 전부의 채점 `score` 평균 반올림(0.5는 올림, KAN-359 세트 점수와 같은 식).
 * 한 대사라도 점수가 없으면(분석 중·다시 녹음 필요·확인 필요) null — 대사 일부만의 평균을 스탬프 점수로 보이지 않는다
 */
export function reportScore(scores: (number | null)[]): number | null {
  if (scores.length === 0 || scores.some((s) => s === null)) return null
  return Math.round((scores as number[]).reduce((a, b) => a + b, 0) / scores.length)
}

/**
 * 「다시 연습할 대사」 — 점수가 가장 낮은 대사의 위치, 동점이면 앞 대사. 점수 있는 대사가 없거나
 * 최저점도 ★3 경계 이상이면(전부 잘 읽었으면) null — 100점 대사를 다시 연습하라고 내밀지 않는다
 */
export function practiceIndex(scores: (number | null)[], thresholds?: readonly number[] | null): number | null {
  let pick: number | null = null
  scores.forEach((s, i) => {
    if (s !== null && (pick === null || s < scores[pick]!)) pick = i
  })
  return pick !== null && starsForScore(scores[pick]!, thresholds) < 3 ? pick : null
}
