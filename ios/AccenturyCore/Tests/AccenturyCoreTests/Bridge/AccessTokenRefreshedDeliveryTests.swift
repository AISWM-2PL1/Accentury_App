import XCTest
@testable import AccenturyCore

/// `app/src/test/java/com/accentury/app/bridge/AccessTokenRefreshedDeliveryTest.kt`의 이식본 (KAN-255).
final class AccessTokenRefreshedDeliveryTests: XCTestCase {

    private let tokens = AuthTokens(accessToken: "a", refreshToken: "r")

    func testOnlyAStoredNewAccessIsOk() {
        XCTAssertEqual("ok", accessTokenRefreshResult(.refreshed(tokens)))
    }

    /// Refresh 거절·판정 실패·로그인을 끈 빌드(nil)는 전부 failed다.
    func testSignedOutFailedAndNilAreAllFailed() {
        XCTAssertEqual("failed", accessTokenRefreshResult(.signedOut))
        XCTAssertEqual("failed", accessTokenRefreshResult(.failed(.transportError(reason: "timeout"))))
        XCTAssertEqual("failed", accessTokenRefreshResult(nil))
    }

    /// 회신은 onAccessTokenRefreshed 슬롯에 JSON이 아닌 문자열 그대로 간다.
    func testDeliveryGoesToTheSlotAsAPlainString() {
        let js = accessTokenRefreshedDeliveryJs(.refreshed(tokens))
        XCTAssertTrue(js.contains("window.AccenturyWeb.onAccessTokenRefreshed;"), js)
        XCTAssertTrue(js.contains(#"f("ok")"#), js)
        XCTAssertTrue(accessTokenRefreshedDeliveryJs(nil).contains(#"f("failed")"#))
    }
}
