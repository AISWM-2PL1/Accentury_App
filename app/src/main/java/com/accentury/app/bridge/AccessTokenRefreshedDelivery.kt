package com.accentury.app.bridge

import com.accentury.app.auth.RefreshOutcome

/**
 * 계정 토큰 갱신 결과를 웹 계약 값으로 접는다 (KAN-255, webview-bridge.md §11).
 *
 * `'ok'`는 쓸 수 있는 새 Access가 저장돼 있을 때뿐이다. SignedOut(Refresh 거절)·Failed(전송 실패·429·5xx)·
 * 예외(null)는 전부 `'failed'` — 웹은 어느 쪽이든 `UNAUTHENTICATED`로 끝내므로 갈래를 나눠 줄 이유가 없다.
 */
fun accessTokenRefreshResult(outcome: RefreshOutcome?): String =
    if (outcome is RefreshOutcome.Refreshed) "ok" else "failed"

/**
 * 갱신 결과 회신 주입 JS. 인자는 JSON이 아니라 문자열 `'ok' | 'failed'` 그대로다 (§3) — [webDeliveryJs]가
 * payload를 JS 문자열 리터럴로 넘기므로 웹은 `"ok"`를 받는다. 수신 슬롯이 없으면(웹이 이미 타임아웃으로
 * 슬롯을 해제했다) 아무 일도 없다.
 */
fun accessTokenRefreshedDeliveryJs(outcome: RefreshOutcome?): String =
    webDeliveryJs(method = "onAccessTokenRefreshed", payloadJson = accessTokenRefreshResult(outcome))
