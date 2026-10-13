import AccenturyCore
import XCTest
@testable import Accentury

/// 새 실행과 장면 복원의 구분 (KAN-252 4단계 보완). 안드로이드는 `rememberSaveable`이라 시스템이 죽인 프로세스를 되살릴
/// 때만 응시가 이어지고, 사용자가 앱을 새로 열면 홈부터다. iOS는 저장이 `UserDefaults`라 그 구분을 장면 저장소 표시가
/// 넘겨주는 `restoresSavedState`로 만든다 — 여기서는 그 값에 따라 첫 진입 URL이 갈리는지를 본다.
@MainActor
final class TestFlowModelRestoreTests: XCTestCase {

    private var suiteName = ""
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "TestFlowModelRestoreTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    private func model(restoring: Bool) -> TestFlowModel {
        TestFlowModel(
            restoresSavedState: restoring, defaults: defaults, sessionClient: NewSessionClient(),
            isMicGranted: { true }, onProfileIncomplete: {}, tabBarEntry: true
        )
    }

    /// 시작 게이트를 지나 세션까지 만든 앞 실행 — 진입 URL이 테스트를 가리킨다.
    private func previousRunInTest() async -> TestFlowModel {
        let model = model(restoring: true)
        model.onRequestMicPermission()
        model.onStartGateMicPassed()
        model.onVoiceCheckDone(centerHz: 180)
        await model.createSessionIfNeeded()
        XCTAssertTrue(model.webUrl.contains("s_restore_1"), model.webUrl)
        return model
    }

    func test새_실행은_앞_실행이_테스트_중이었어도_홈으로_시작한다() async {
        _ = await previousRunInTest()

        let fresh = model(restoring: false)

        XCTAssertTrue(fresh.webUrl.contains("screen=home"), fresh.webUrl)
        XCTAssertFalse(fresh.webUrl.contains("s_restore_1"), fresh.webUrl)
        XCTAssertFalse(fresh.startRequested)
        XCTAssertNil(fresh.session)
        // 업데이트 전 빌드가 남긴 키도 이 갈래에서 지워진다 — 다음 실행이 다시 끌려가지 않는다.
        XCTAssertNil(defaults.object(forKey: TestFlowModel.startRequestedKey))
        XCTAssertNil(defaults.object(forKey: TestFlowModel.gateStorageKey))
    }

    func test장면_복원은_테스트_진입_URL을_그대로_잇는다() async {
        _ = await previousRunInTest()

        let restored = model(restoring: true)

        XCTAssertTrue(restored.startRequested)
        XCTAssertTrue(restored.webUrl.contains("s_restore_1"), restored.webUrl)
        XCTAssertFalse(restored.webUrl.contains("screen=home"), restored.webUrl)
    }

    func test재응시_뒤_장면_복원은_인트로이고_새_실행은_홈이다() async {
        let previous = await previousRunInTest()
        _ = await previous.startRetest()
        XCTAssertFalse(previous.webUrl.contains("screen="), previous.webUrl)

        let restored = model(restoring: true)
        XCTAssertFalse(restored.webUrl.contains("screen="), "재응시 직후 복원은 홈이 아니라 인트로다: \(restored.webUrl)")

        let fresh = model(restoring: false)
        XCTAssertTrue(fresh.webUrl.contains("screen=home"), fresh.webUrl)
    }
}

/// 매번 새 세션을 주는 세션 생성. 재응시는 버릴 세션이 있어야 요청이 나간다.
private final class NewSessionClient: SessionClient, @unchecked Sendable {
    private var count = 0

    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?
    ) async -> SessionResult {
        count += 1
        return .created(
            Session(
                sessionId: "s_restore_\(count)",
                sessionToken: "st_restore_\(count)",
                testVersion: "gn-2026.08.1",
                voiceSet: 1,
                scoreVersion: "sv-test",
                expiresAt: "2099-01-01T00:00:00Z"
            )
        )
    }
}
