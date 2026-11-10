/**
 * 큰 글자 표식 — 루트 글자 크기가 기본(16px)보다 크면 `<html data-large-text>`를 단다 (KAN-313).
 *
 * CSS의 큰 글자 전용 규칙(낱말 단위 끊기, 홈 등급 카드·탭 라벨·결과 점수 재배치)은 전부
 * `html[data-large-text]` 아래에 있다. 기본 글자 배치는 이 속성이 없을 때 그대로다.
 *
 * ## 왜 JS인가 (PR #68 리뷰 2026-11-10)
 *
 * 처음에는 `body { container: page / inline-size }`와 `@container page (max-width: 19.9rem)`로
 * 화면 폭을 rem으로 재서 큰 글자를 가렸다. 두 가지가 문제였다.
 * - 옛 엔진(Chromium 128 이하, WebKit 284730@main 이전 = iOS 16~17 Safari·WKWebView)은 `container-type`에
 *   layout containment를 걸어 body가 `position: fixed` 요소(앱바·탭 바·닫기·시트)의 기준 상자가 된다.
 *   기본 글자에서도 앱바·탭 바가 문서와 함께 움직일 수 있다. Chromium 129, WebKit 284730@main에서 빠졌다
 * - 화면 폭 rem으로는 320 폭 기본 글자(20rem)와 412 폭 125%(20.6rem)를 가를 수 없어, 그 사이 중간 배율
 *   (106~124%)에서 재배치가 꺼진 채 글자만 커져 탭 라벨·등급명이 넘쳤다(KAN-327)
 * 루트 글자 크기를 직접 읽으면 둘 다 없어진다.
 *
 * ## 호출 계약
 *
 * 루트 글자 크기가 바뀔 수 있는 때마다 부른다. 지금은 `main.tsx`가 첫 렌더 전에 한 번, 그리고 `resize` 때 부른다.
 * 네이티브가 OS 글자 배율을 루트 글자 크기(`document.documentElement.style.fontSize`)로 주입하는 후속 티켓은
 * 주입 직후 이 함수를 직접 부르거나 `resize` 이벤트를 보내야 한다 — 글자 크기 변경은 브라우저가 알려 주지 않는다.
 */

/** 기본 루트 글자 크기 (16px = 1rem) */
const BASE_FONT_PX = 16
/** 부동소수 여유. 106%(16.96px)는 큰 글자, 16.0x px는 기본으로 본다 */
const TOLERANCE_PX = 0.5

export function syncLargeText(root: HTMLElement = document.documentElement): void {
  const px = parseFloat(getComputedStyle(root).fontSize)
  root.toggleAttribute('data-large-text', px > BASE_FONT_PX + TOLERANCE_PX)
}
