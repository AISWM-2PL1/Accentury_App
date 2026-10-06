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

    /// 익명 모드 (KAN-270 6단계). 저장소 값이 세션 생성 body의 동의 버전으로 가고, 계정 모드(nil 주입)는 싣지 않는다.
    func test익명_동의를_주입하면_세션_생성에_동의_버전을_싣고_계정_모드는_싣지_않는다() async {
        let consented = AnonymousVoiceConsentStore(defaults: defaults)
        consented.save(consented: true)
        let anonymousClient = RecordingClient()
        await startAndCreate(TestFlowModel(
            defaults: defaults, sessionClient: anonymousClient, isMicGranted: { true }, onProfileIncomplete: {},
            anonymousConsent: consented
        ))
        XCTAssertEqual(["2026-10-04"], anonymousClient.versions)

        TestFlowModel.clearSavedState(in: defaults)
        let accountClient = RecordingClient()
        await startAndCreate(TestFlowModel(
            defaults: defaults, sessionClient: accountClient, isMicGranted: { true }, onProfileIncomplete: {}
        ))
        XCTAssertEqual([nil], accountClient.versions)
    }

    func test익명_동의를_아직_안_물었으면_권한_다음에_동의_단계가_서고_고르면_걷힌다() {
        let store = AnonymousVoiceConsentStore(defaults: defaults)
        let model = TestFlowModel(
            defaults: defaults, sessionClient: nil, isMicGranted: { true }, onProfileIncomplete: {},
            anonymousConsent: store
        )
        XCTAssertTrue(model.needsAnonymousConsent)

        model.onAnonymousConsentChosen(consented: false)

        XCTAssertFalse(model.needsAnonymousConsent)
        XCTAssertTrue(store.asked())
        XCTAssertFalse(store.consented())
    }

    /// 익명 모드의 출신 지역 (KAN-270 7단계). 동의했고 지역이 있으면 세션 body의 region으로 가고, 고르기 전에는 지역 단계가 선다.
    func test익명_동의와_지역을_주입하면_세션_생성에_region을_싣는다() async {
        let store = AnonymousVoiceConsentStore(defaults: defaults)
        store.save(consented: true)
        let model = TestFlowModel(
            defaults: defaults, sessionClient: RecordingClient(), isMicGranted: { true }, onProfileIncomplete: {},
            anonymousConsent: store
        )
        XCTAssertTrue(model.needsAnonymousRegion)

        model.onAnonymousRegionChosen("JEJU")
        XCTAssertFalse(model.needsAnonymousRegion)

        let client = RecordingClient()
        await startAndCreate(TestFlowModel(
            defaults: defaults, sessionClient: client, isMicGranted: { true }, onProfileIncomplete: {},
            anonymousConsent: store
        ))
        XCTAssertEqual(["JEJU"], client.regions)
    }

    /// 재응시 직전의 출신 지역 (KAN-270, PR #22 리뷰). 처음에 건너뛴 사람이 설정에서 동의를 켠 뒤 재응시하면,
    /// 세션을 만들기 전에 지역 단계가 서고 고른 뒤의 재응시가 region을 싣는다.
    func test동의는_켰는데_지역이_없으면_재응시가_세션을_만들기_전에_지역부터_묻는다() async {
        let store = AnonymousVoiceConsentStore(defaults: defaults)
        store.save(consented: false)
        let client = CreatingClient()
        let model = TestFlowModel(
            defaults: defaults, sessionClient: client, isMicGranted: { true }, onProfileIncomplete: {},
            anonymousConsent: store
        )
        await startAndCreate(model)
        XCTAssertNotNil(model.session)
        XCTAssertEqual([nil], client.regions)

        // 설정에서 뒤늦게 동의를 켰다. 지역은 아직 없다.
        store.save(consented: true)
        let held = await model.startRetest()

        XCTAssertNil(held)
        XCTAssertTrue(model.retestRegionPending)
        XCTAssertEqual(1, client.regions.count, "지역을 고르기 전에는 재응시 요청이 나가면 안 된다")

        model.onRetestRegionChosen("JEJU")
        XCTAssertFalse(model.retestRegionPending)
        _ = await model.startRetest()

        XCTAssertEqual([nil, "JEJU"], client.regions)
        XCTAssertEqual([nil, "2026-10-04"], client.versions)
    }

    /// 지역이 이미 있거나 미동의면 재응시는 지역 단계 없이 곧장 세션 요청으로 간다.
    func test지역이_이미_있거나_미동의면_재응시는_지역_단계_없이_진행한다() async {
        let store = AnonymousVoiceConsentStore(defaults: defaults)
        store.save(consented: false)
        let client = CreatingClient()
        let model = TestFlowModel(
            defaults: defaults, sessionClient: client, isMicGranted: { true }, onProfileIncomplete: {},
            anonymousConsent: store
        )
        await startAndCreate(model)

        // 미동의 재응시.
        _ = await model.startRetest()
        XCTAssertFalse(model.retestRegionPending)
        XCTAssertEqual([nil, nil], client.regions)

        // 동의했고 지역도 있는 재응시.
        store.save(consented: true)
        store.saveRegion("SEOUL")
        _ = await model.startRetest()
        XCTAssertFalse(model.retestRegionPending)
        XCTAssertEqual([nil, nil, "SEOUL"], client.regions)
    }

    private func startAndCreate(_ model: TestFlowModel) async {
        model.onRequestMicPermission()
        model.onStartGateMicPassed()
        model.onVoiceCheckDone(centerHz: 180)
        await model.createSessionIfNeeded()
    }
}

/// 받은 동의 버전·지역을 적는 세션 생성. 결과는 재시도 없는 전송 실패라 폴백도 타지 않는다.
private final class RecordingClient: SessionClient, @unchecked Sendable {
    private(set) var versions: [String?] = []
    private(set) var regions: [String?] = []

    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?
    ) async -> SessionResult {
        versions.append(voiceConsentVersion)
        regions.append(region)
        return .transportError(reason: "test")
    }
}

/// 받은 동의 버전과 지역을 적고 매번 새 세션을 주는 세션 생성. 재응시는 버릴 세션이 있어야 요청이 나간다.
private final class CreatingClient: SessionClient, @unchecked Sendable {
    private(set) var versions: [String?] = []
    private(set) var regions: [String?] = []

    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?
    ) async -> SessionResult {
        versions.append(voiceConsentVersion)
        regions.append(region)
        return .created(
            Session(
                sessionId: "s_test_\(regions.count)",
                sessionToken: "st_test_\(regions.count)",
                testVersion: "gn-2026.08.1",
                voiceSet: 1,
                scoreVersion: "sv-test",
                expiresAt: "2099-01-01T00:00:00Z"
            )
        )
    }
}

/// 서버가 프로필 미완료로 막는 세션 생성.
private struct ProfileIncompleteClient: SessionClient {
    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?
    ) async -> SessionResult {
        .rejected(code: "AUTH_PROFILE_INCOMPLETE", message: "m", retryable: false, retryAfterMs: nil)
    }
}
