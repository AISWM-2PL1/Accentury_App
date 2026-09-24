/**
 * 문항 제출이 "이 세션으로는 더 갈 수 없다"로 거절됐는지 판정한다 (KAN-237).
 *
 * 세션 TTL(30분)이 지난 뒤의 제출은 401 `SESSION_EXPIRED`, 다른 사람의 세션이면 403
 * `SESSION_FORBIDDEN`이 온다. 둘 다 retryable=false이고, 같은 녹음·같은 답을 다시 보내도
 * 재녹음해도 같은 거절이 돌아온다 — 사용자가 할 수 있는 일은 새로 테스트하는 것뿐이다.
 * 두 코드를 묶는 이유는 `FeedbackSheet`가 같은 두 코드를 한 갈래로 묶은 것과 같다.
 *
 * 음성(`WebVoiceRecorder`)·어휘(`VocabularyItemScreen`) 두 화면이 같은 판정을 써야 해서
 * 여기 둔다 — 한쪽만 코드가 늘면 같은 만료에 한 화면은 출구를, 다른 화면은 막다른 길을 준다.
 */

export const SESSION_EXIT_CODES = ['SESSION_EXPIRED', 'SESSION_FORBIDDEN'] as const

export function isSessionExitCode(code: string | null | undefined): boolean {
  return (SESSION_EXIT_CODES as readonly string[]).includes(code ?? '')
}
