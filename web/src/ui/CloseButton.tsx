/**
 * 화면 오른쪽 위 닫기 ✕ (KAN-252, 2026-10-13 사용자 결정). 단어 학습 카드·퀴즈처럼 탭 바가 숨는 진행 중 화면의
 * 출구다 — 탭 바가 없으면 끝까지 가야만 나갈 수 있었다. 억양 학습 녹음 화면의 네이티브 ✕
 * (`IntonationCloseButton`)와 같은 모양·같은 뜻이다: 크림 원 48px + 잉크 Material close.
 *
 * 그림은 `app/src/main/res/drawable/outline_close_24.xml`의 pathData 그대로다 (Google Material Icons,
 * Apache License 2.0). 글자 라벨이 없으니 접근성 이름 「닫기」를 버튼에 단다 — svg는 `aria-hidden`(TabBar와 같은 규칙).
 */

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="close-button" aria-label="닫기" onClick={onClick}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"
        />
      </svg>
    </button>
  )
}
