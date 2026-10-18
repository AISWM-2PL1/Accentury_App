/**
 * 화면 맨 위 「Accentury」 워드마크 앱바 (KAN-288 디자인 3, 시안 `.appbar`·`.appbrand`, 사용자 결정 2026-10-18).
 *
 * `main.tsx`가 `App` 위에 한 번만 그린다 — 화면마다 달면 화면이 바뀔 때마다 다시 그려져 깜빡이고, 빠뜨린 화면이
 * 생긴다. 오른쪽 자리는 비워 둔다: 닫기 ✕(`CloseButton`)와 앱의 네이티브 톱니가 고정 위치로 이 띠 위에 앉는다.
 * 워드마크는 브랜드 표기라 heading이 아니다 (네이티브 `PaperAppBar`와 같은 판단).
 */
export function AppBar() {
  return (
    <header className="app-bar">
      <span className="app-bar__brand">Accentury</span>
    </header>
  )
}
