/**
 * 억양 학습 A-4 분석 대기의 단계 표시 (KAN-254 2단계). 서버는 카드 1건 채점에 단계를 주지 않으므로
 * 경과 시간으로 파생한다 — 진행을 지어내는 것이 아니라 기다림에 눈금을 주는 것이다(`analysisStage.ts`와 같은 판단).
 * 경계값 2.5초·6초는 채점 대부분이 6초 안에 끝난다는 가정의 눈금이고, 서버 처리 단계와 1:1이 아니다.
 */

/** 화면에 그릴 단계 이름. 순서가 곧 번호다 */
export const WAITING_STAGES = ['곡선 추출', '분포 비교', '점수 계산'] as const

/** 이만큼 기다리면 단계 아래에 안심 문구를 한 줄 띄운다 */
export const SLOW_NOTICE_MS = 10_000

/** 지금 진행 중인 단계 (1-기반) */
export function waitingStage(elapsedMs: number): 1 | 2 | 3 {
  if (elapsedMs < 2_500) return 1
  if (elapsedMs < 6_000) return 2
  return 3
}
