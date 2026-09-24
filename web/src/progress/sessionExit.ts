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

/**
 * 세션 만료 문구 — 서버 `SESSION_EXPIRED` 봉투의 message와 같은 문장이다 (KAN-237).
 *
 * 다른 자리는 봉투 문구를 그대로 쓰지만, 앱 대기 푸터(`VoiceItemScreen` 브리지 분기)에는
 * 봉투가 오지 않는다: 업로드는 네이티브가 하고, 브리지 계약상 실패는 웹에 통지되지 않는다
 * (성공 `onItemResult`만 온다). 웹이 `/analyses` 확인으로 만료를 알아내도 그 응답은 조회의
 * 거절이지 제출의 거절이 아니라서, 사용자가 보는 문구는 다른 자리와 같은 이 한 줄로 고정한다.
 */
export const SESSION_EXPIRED_MESSAGE = '세션이 만료되었습니다. 테스트를 다시 시작해 주세요.'
