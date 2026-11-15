/**
 * 홈 [이어가기] → 학습 탭 「지금 스탬프로 바로」 일회성 표식 (KAN-347 3-6).
 *
 * URL(`resume=1`)에 싣지 않는 이유: 스토어의 옛 앱 빌드와 새 빌드 모두 웹이 알려 준 현재 URL로 다음 탭 URL을 만들며
 * (`webTabUrl`) 모르는 쿼리를 보존한다. 웹이 걷기 전에 네이티브가 그 URL을 들고 있으면 녹음 ✕·뒤로가기가 `resume=1`째로
 * 다시 열어 지도 대신 스탬프로 들어간다. 표식은 WebView 안의 `sessionStorage`에 두고, 학습 탭이 읽는 즉시 지운다 — 문서
 * 전체 로드(구버전 앱)든 SPA 이동이든 같은 출처·같은 탭이라 건넌다. 저장소 접근이 막힌 환경(사생활 보호 모드 등)에서는
 * 조용히 실패하고 학습 탭은 지도에 머문다(`session/webSession`과 같은 처리).
 */
const RESUME_KEY = 'accentury.learning.resume'

export function markResumeLearning(): void {
  try {
    sessionStorage.setItem(RESUME_KEY, '1')
  } catch {
    // 저장소가 막혔다 — 이어가기가 지도에서 멈출 뿐이다
  }
}

/** 표식을 읽고 바로 지운다. 한 번 `true`를 돌려준 뒤에는 새 표식 전까지 `false`다 */
export function takeResumeLearning(): boolean {
  try {
    const marked = sessionStorage.getItem(RESUME_KEY) === '1'
    sessionStorage.removeItem(RESUME_KEY)
    return marked
  } catch {
    return false
  }
}
