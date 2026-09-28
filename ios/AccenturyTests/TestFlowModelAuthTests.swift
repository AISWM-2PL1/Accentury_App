import AccenturyCore
import XCTest
@testable import Accentury

/// 흐름 모델의 로그인 결선 (KAN-224). 판정(403 `AUTH_PROFILE_INCOMPLETE` → 별도 상태)은 Core
/// `SessionGateControllerTests`가 덮고, 여기서는 앱 타깃에 생긴 두 가지를 본다 — 막히면 시작 게이트를 되감고
/// 추가 정보 화면으로 넘기는가, 그리고 관문이 SignedIn을 벗어날 때 저장해 둔 응시를 지우는가.
@MainActor
final class TestFlowModelAuthTests: XCTestCase {

    private var suiteName = ""
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "TestFlowModelAuthTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func test세션_생성이_프로필_미완료로_막히면_시작_게이트를_되감고_추가_정보로_넘긴다() async {
        var leftForProfile = 0
        let model = TestFlowModel(
            defaults: defaults,
            sessionClient: ProfileIncompleteClient(),
            isMicGranted: { true },
            onProfileIncomplete: { leftForProfile += 1 }
        )
        model.onRequestMicPermission()
        model.onStartGateMicPassed()
        model.onVoiceCheckDone(centerHz: 180)

        await model.createSessionIfNeeded()

        XCTAssertEqual(1, leftForProfile)
        XCTAssertFalse(model.startRequested)
        XCTAssertFalse(model.micPassed)
        XCTAssertNil(model.voiceCenterHz)
        XCTAssertNil(model.session)
    }

    func test저장해_둔_응시를_지우면_다음_모델은_인트로부터_시작한다() {
        let first = TestFlowModel(defaults: defaults, sessionClient: nil, isMicGranted: { true }, onProfileIncomplete: {})
        first.onRequestMicPermission()
        first.onStartGateMicPassed()
        first.applyAppLink(URL(string: "https://accentury.app/t?c=kko_share"))

        TestFlowModel.clearSavedState(in: defaults)

        let restored = TestFlowModel(defaults: defaults, sessionClient: nil, isMicGranted: { true }, onProfileIncomplete: {})
        XCTAssertFalse(restored.startRequested)
        XCTAssertFalse(restored.micPassed)
        XCTAssertNil(restored.campaignToken)
    }
}

/// 서버가 프로필 미완료로 막는 세션 생성.
private struct ProfileIncompleteClient: SessionClient {
    func create(appVersion: String, previousToken: String?, campaignToken: String?) async -> SessionResult {
        .rejected(code: "AUTH_PROFILE_INCOMPLETE", message: "m", retryable: false, retryAfterMs: nil)
    }
}
