import Foundation

/// 계정 토큰 갱신 결과를 웹 계약 값으로 접는다 (KAN-255, webview-bridge.md §11).
/// 안드로이드 `bridge/AccessTokenRefreshedDelivery.kt`의 이식본이다.
///
/// `"ok"`는 쓸 수 있는 새 Access가 저장돼 있을 때뿐이다. `signedOut`(Refresh 거절)·`failed`(전송 실패·429·5xx)·
/// nil(로그인을 끈 빌드라 갱신 자체를 하지 않았다)은 전부 `"failed"` — 웹은 어느 쪽이든 `UNAUTHENTICATED`로
/// 끝내므로 갈래를 나눠 줄 이유가 없다.
public func accessTokenRefreshResult(_ outcome: RefreshOutcome?) -> String {
    if case .refreshed = outcome { return "ok" }
    return "failed"
}

/// 갱신 결과 회신 주입 JS. 인자는 JSON이 아니라 문자열 `'ok' | 'failed'` 그대로다 (§3) —
/// ``webDeliveryJs(method:payloadJson:)``가 payload를 JS 문자열 리터럴로 넘기므로 웹은 `"ok"`를 받는다.
/// 수신 슬롯이 없으면(웹이 이미 타임아웃으로 슬롯을 해제했다) 아무 일도 없다.
public func accessTokenRefreshedDeliveryJs(_ outcome: RefreshOutcome?) -> String {
    webDeliveryJs(method: "onAccessTokenRefreshed", payloadJson: accessTokenRefreshResult(outcome))
}
