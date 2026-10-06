import XCTest
@testable import AccenturyCore

/// 동의 버전 폴백 (KAN-270 6단계). 안드로이드 `session/SessionClientConsentFallbackTest.kt`의 1:1 이식본 (6개).
final class SessionClientConsentFallbackTests: XCTestCase {

    private struct Call: Equatable {
        let previousToken: String?
        let campaignToken: String?
        let voiceConsentVersion: String?
        var region: String? = nil
    }

    /// 미리 준 결과를 차례로 돌려주고 받은 인자를 적는다.
    private final class FakeClient: SessionClient, @unchecked Sendable {
        private var queue: [SessionResult]
        private(set) var calls: [Call] = []

        init(_ results: SessionResult...) { queue = results }

        func create(
            appVersion: String,
            previousToken: String?,
            campaignToken: String?,
            voiceConsentVersion: String?,
            region: String?
        ) async -> SessionResult {
            calls.append(Call(
                previousToken: previousToken, campaignToken: campaignToken, voiceConsentVersion: voiceConsentVersion,
                region: region
            ))
            return queue.removeFirst()
        }

        func run(_ version: String?) async -> SessionResult {
            await createWithConsentFallback(
                appVersion: "1.0",
                previousToken: "st_old",
                campaignToken: "c1",
                voiceConsentVersion: version
            )
        }
    }

    private let created = SessionResult.created(
        Session(sessionId: "s", sessionToken: "st_new", testVersion: "tv", voiceSet: 1, scoreVersion: "sv",
                expiresAt: "2026-10-06T00:00:00Z")
    )
    private let validationFailed = SessionResult.rejected(
        code: "VALIDATION_FAILED", message: "m", retryable: false, retryAfterMs: nil
    )

    func test동의를_실은_400_VALIDATION_FAILED는_동의_없이_한_번_더_만든다_이전_토큰과_유입_코드는_그대로() async {
        let client = FakeClient(validationFailed, created)

        let result = await client.run("2026-10-04")

        XCTAssertEqual(created, result)
        XCTAssertEqual(
            [
                Call(previousToken: "st_old", campaignToken: "c1", voiceConsentVersion: "2026-10-04"),
                Call(previousToken: "st_old", campaignToken: "c1", voiceConsentVersion: nil),
            ],
            client.calls
        )
    }

    func test폴백_재시도에서도_region은_그대로_싣는다_KAN274() async {
        let client = FakeClient(validationFailed, created)

        _ = await client.createWithConsentFallback(
            appVersion: "1.0", previousToken: nil, campaignToken: nil, voiceConsentVersion: "2026-10-04", region: "JEJU"
        )

        XCTAssertEqual(
            [
                Call(previousToken: nil, campaignToken: nil, voiceConsentVersion: "2026-10-04", region: "JEJU"),
                // 지역은 동의와 무관한 값이다 - 동의만 빠지고 지역은 남는다
                Call(previousToken: nil, campaignToken: nil, voiceConsentVersion: nil, region: "JEJU"),
            ],
            client.calls
        )
    }

    func test두_번째도_실패하면_그_결과를_돌려주고_더_부르지_않는다() async {
        let second = SessionResult.transportError(reason: "down")
        let client = FakeClient(validationFailed, second)

        let result = await client.run("2026-10-04")

        XCTAssertEqual(second, result)
        XCTAssertEqual(2, client.calls.count)
    }

    func test다른_거절은_재시도하지_않는다() async {
        let rateLimited = SessionResult.rejected(code: "RATE_LIMITED", message: "m", retryable: true, retryAfterMs: 1_000)
        let client = FakeClient(rateLimited)

        let result = await client.run("2026-10-04")

        XCTAssertEqual(rateLimited, result)
        XCTAssertEqual(1, client.calls.count)
    }

    func test미동의_요청의_400_VALIDATION_FAILED는_재시도하지_않는다() async {
        let client = FakeClient(validationFailed)

        let result = await client.run(nil)

        XCTAssertEqual(validationFailed, result)
        XCTAssertEqual(1, client.calls.count)
    }

    func test성공은_한_번만_부른다() async {
        let client = FakeClient(created)

        let result = await client.run("2026-10-04")

        XCTAssertEqual(created, result)
        XCTAssertEqual([Call(previousToken: "st_old", campaignToken: "c1", voiceConsentVersion: "2026-10-04")], client.calls)
    }
}
