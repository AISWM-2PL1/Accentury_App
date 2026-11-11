import XCTest
@testable import AccenturyCore

/// App Store 빌드 15 거절(2026-11-09) 대응 묶음의 Core 판정 (KAN-330 / KAN-344). 안드로이드가 같은 명세로 따로 구현하므로
/// 갈래마다 기대값을 표로 적어 두 플랫폼이 같은 답을 내는지 이 파일만 보고 대조할 수 있게 했다.
@MainActor
final class StoreReviewFixTests: XCTestCase {

    private func tokens(_ n: Int) -> String { #"{"accessToken":"jwt_\#(n)","refreshToken":"rt_\#(n)","accessTokenExpiresInSec":900}"# }
    private let guestResponse = """
    {"accessToken":"jwt_g","refreshToken":"rt_g","accessTokenExpiresInSec":900,
     "user":{"id":"g-1","provider":"GUEST"}}
    """
    private let guestMe = #"{"profileStatus":"INCOMPLETE","user":{"id":"g-1","provider":"GUEST"},"voiceConsent":{"consented":false,"currentVersion":"2026-10-04"}}"#
    private func envelope(_ code: String, _ retryable: Bool) -> String {
        #"{"code":"\#(code)","message":"m","retryable":\#(retryable),"correlationId":"c"}"#
    }

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
    }

    override func tearDown() {
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func controller(_ store: TokenStore) -> (AuthGateController, AuthClients) {
        let clients = AuthClients(baseURL: "https://api.test/", store: store, session: MockURLProtocol.makeSession())
        let gate = AuthGateController(
            api: clients.api,
            store: store,
            refresher: clients.refresher,
            logoutServerTimeout: .seconds(2),
            logoutIdpTimeout: .seconds(2)
        )
        return (gate, clients)
    }

    private func body(_ recorded: MockURLProtocol.Recorded?) throws -> [String: Any] {
        let data = try XCTUnwrap(recorded).body
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: 게스트 (KAN-330, 서버 KAN-329 §3.21)

    func test게스트_발급은_동의_두_필드를_토큰_없이_보내고_쌍을_저장해_게스트로_들어간다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, guestResponse)])

        await gate.startGuest(privacyPolicyVersion: "2026-10-20")

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("POST", recorded.method)
        XCTAssertEqual("/v0/auth/guest", recorded.url?.path)
        XCTAssertNil(recorded.header("Authorization"))
        let sent = try body(recorded)
        XCTAssertEqual(true, sent["privacyConsent"] as? Bool)
        XCTAssertEqual("2026-10-20", sent["privacyPolicyVersion"] as? String)
        XCTAssertEqual(AuthTokens("jwt_g", "rt_g"), store.tokens)
        XCTAssertEqual(.guest, gate.state)
        XCTAssertEqual("guest", gate.state.accountKind)
    }

    func test게스트_하루_상한은_분당_제한과_다른_안내이고_저장소를_건드리지_않는다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        // 대기 시간이 실려 와도 하루 상한 갈래다.
        MockURLProtocol.respondInOrder([(429, #"{"code":"AUTH_GUEST_LIMIT_EXCEEDED","message":"m","retryable":false,"retryAfterMs":60000}"#)])

        await gate.startGuest(privacyPolicyVersion: "2026-10-20")

        XCTAssertEqual(.signedOut(AuthFailure(.guestLimitExceeded)), gate.state)
        XCTAssertNil(store.tokens)
    }

    func test재시작_때_서버_계정이_GUEST면_추가_정보가_아니라_게스트로_들어간다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, guestMe)])

        await gate.bootstrap()

        XCTAssertEqual(.guest, gate.state)
    }

    func test게스트에게_막힌_API의_403은_로그아웃시키지_않는다() async {
        let store = InMemoryTokenStore()
        let (gate, clients) = controller(store)
        MockURLProtocol.respondInOrder([(200, guestResponse), (403, envelope("AUTH_GUEST_NOT_ALLOWED", false))])
        await gate.startGuest(privacyPolicyVersion: "2026-10-20")

        let result = await clients.api.updateProfile(ProfileInput(email: "a@b.co", name: "n", birthDate: "2000-01-02", gender: nil, region: "SEOUL"))

        guard case .rejected(403, "AUTH_GUEST_NOT_ALLOWED", _, _, _) = result else { return XCTFail("\(result)") }
        // 갱신을 부르지 않는다(요청은 발급 + 403 둘뿐) — 토큰도 상태도 그대로다.
        XCTAssertEqual(2, MockURLProtocol.requestCount)
        XCTAssertEqual(AuthTokens("jwt_g", "rt_g"), store.tokens)
        XCTAssertEqual(.guest, gate.state)
    }

    func test게스트를_떠나면_서버_로그아웃_뒤_저장소를_비우고_로그인_화면이다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, guestResponse), (204, "")])
        await gate.startGuest(privacyPolicyVersion: "2026-10-20")

        await gate.leaveGuest()

        XCTAssertEqual("/v0/auth/logout", MockURLProtocol.lastRequest()?.url?.path)
        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    func test게스트_떠나기는_서버가_실패해도_로컬을_비운다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, guestResponse), (503, envelope("AUTH_STORE_UNAVAILABLE", true))])
        await gate.startGuest(privacyPolicyVersion: "2026-10-20")

        await gate.leaveGuest()

        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    func test게스트_떠나기_연타는_한_번만_돌고_그사이_끝난_회원_로그인을_늦은_정리가_지우지_않는다() async {
        // KAN-330 리뷰 P1. 첫 이탈이 게스트 쌍을 읽은 뒤(서버 로그아웃 전) 붙잡고, 그사이 두 번째 호출과 회원 로그인을 끝낸다.
        let store = HeldReadTokenStore()
        let (gate, _) = controller(store)
        let member = #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"#
        let login = #"{"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":false,"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"#
        MockURLProtocol.respondInOrder([(200, guestResponse), (200, login), (200, member), (204, "")])
        await gate.startGuest(privacyPolicyVersion: "2026-10-20")

        store.holdNextRead()
        let first = Task { await gate.leaveGuest() }
        await store.waitUntilReadHeld()
        await gate.leaveGuest()
        await gate.login(LoginCredential(provider: .GOOGLE, idToken: "fake:g"), privacyPolicyVersion: "v1")
        XCTAssertEqual("member", gate.state.accountKind)
        store.releaseRead()
        await first.value

        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertEqual("member", gate.state.accountKind)
        XCTAssertEqual(
            ["/v0/auth/guest", "/v0/auth/login", "/v0/users/me", "/v0/auth/logout"],
            MockURLProtocol.requests().map { $0.url?.path }
        )
    }

    func test회원은_requestLogin으로_로그아웃되지_않는다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"#)])
        await gate.bootstrap()
        let before = MockURLProtocol.requestCount

        await gate.leaveGuest()

        XCTAssertEqual(before, MockURLProtocol.requestCount)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertEqual("member", gate.state.accountKind)
    }

    func test계정_종류는_게스트_회원_빈값_셋뿐이다() {
        let user = AuthUser(id: "u", provider: .KAKAO)
        let table: [(AuthGateState, String)] = [
            (.guest, "guest"),
            (.signedIn(user, voiceConsent: nil), "member"),
            (.needsProfile(user, error: nil), "member"),
            (.checking, ""),
            (.signedOut(nil), ""),
            (.checkFailed(AuthFailure(.retry)), ""),
        ]
        for (state, kind) in table { XCTAssertEqual(kind, state.accountKind, "\(state)") }
    }

    func test게스트_시작은_방침과_만_14세_둘_다_체크해야_눌린다() async {
        let state = LoginScreenState()
        var started = 0
        for (consented, age) in [(false, false), (true, false), (false, true)] {
            state.consented = consented
            state.ageConfirmed = age
            XCTAssertFalse(state.guestEnabled)
            await state.startGuest { started += 1 }
        }
        XCTAssertEqual(0, started)

        state.consented = true
        state.ageConfirmed = true
        XCTAssertTrue(state.guestEnabled)
        await state.startGuest { started += 1 }
        XCTAssertEqual(1, started)
    }

    // MARK: 성별 선택 (KAN-330, 서버 KAN-328)

    func test성별_없이도_완료할_수_있고_성별은_키째_빠진다() async throws {
        let form = ProfileFormState(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: nil, region: .JEJU)
        XCTAssertTrue(form.isComplete)
        XCTAssertEqual(ProfileInput(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: nil, region: "JEJU"), form.toInput())

        let api = AuthClients(baseURL: "https://api.test/", store: InMemoryTokenStore(AuthTokens("jwt_a", "rt_a")), session: MockURLProtocol.makeSession()).api
        MockURLProtocol.respond(status: 200, body: #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"#)
        _ = await api.updateProfile(try XCTUnwrap(form.toInput()))
        XCTAssertNil(try body(MockURLProtocol.lastRequest())["gender"])
    }

    func test서버_성별이_null이면_선택_안_함으로_채워도_완료된다() {
        let form = ProfileFormState(user: AuthUser(id: "u", provider: .GOOGLE, email: "a@b.co", name: "n", birthDate: "2000-01-02", region: "SEOUL"))
        XCTAssertNil(form.gender)
        XCTAssertTrue(form.isComplete)
    }

    // MARK: 네이버 탈퇴 토큰 (KAN-330, 서버 KAN-343)

    func test네이버_Refresh는_네이버_계정이고_값이_있을_때만_싣는다() {
        for provider in Provider.allCases {
            XCTAssertEqual(provider == .NAVER ? "nr" : nil, naverRefreshTokenForWithdrawal(provider: provider, sdkRefreshToken: "nr"), "\(provider)")
        }
        XCTAssertNil(naverRefreshTokenForWithdrawal(provider: .NAVER, sdkRefreshToken: nil))
        XCTAssertNil(naverRefreshTokenForWithdrawal(provider: .NAVER, sdkRefreshToken: ""))
    }

    func test탈퇴_본문은_네이버_토큰만_있으면_그_키_하나다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(204, "")])

        let outcome = await gate.withdraw(naverRefreshToken: "nr")

        XCTAssertEqual(.withdrawn, outcome)
        let sent = try body(MockURLProtocol.lastRequest())
        XCTAssertEqual(["naverRefreshToken"], Array(sent.keys))
        XCTAssertEqual("nr", sent["naverRefreshToken"] as? String)
    }

    // MARK: 광고 ATT·npa (KAN-344-1, 지침 5.1.1(iv))

    func testATT는_사전_시트를_본_뒤_아직_안_물었으면_늘_묻는다() {
        let statuses: [TrackingStatus] = [.notDetermined, .restricted, .denied, .authorized]
        for consent in AdConsent.allCases {
            for status in statuses {
                XCTAssertEqual(
                    consent != .unknown && status == .notDetermined,
                    shouldRequestTracking(consent: consent, status: status),
                    "\(consent) × \(status)"
                )
            }
        }
    }

    func test맞춤형은_시트_granted이고_ATT_authorized일_때만이다() {
        let statuses: [TrackingStatus] = [.notDetermined, .restricted, .denied, .authorized]
        for consent in AdConsent.allCases {
            for status in statuses {
                XCTAssertEqual(
                    consent == .granted && status == .authorized,
                    personalizationAllowed(consent, tracking: status),
                    "\(consent) × \(status)"
                )
            }
        }
    }
}

/// 설정 「광고 신고」 메일 주소 (KAN-330, 지침 1.2).
final class AdReportMailTests: XCTestCase {

    func test광고_신고는_문의처로_제목과_본문_틀을_실은_mailto다() throws {
        let url = try XCTUnwrap(adReportMailURL(appVersion: "1.0 (16)"))
        XCTAssertEqual("mailto", url.scheme)
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual("team2pl1@gmail.com", components.path)
        let items = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        XCTAssertEqual("[광고 신고] Accentury", items["subject"])
        XCTAssertTrue(items["body"]?.hasSuffix("앱 버전: 1.0 (16)") == true)
    }
}

/// 다음 read 한 번을 값을 읽은 뒤 풀 때까지 붙잡는 가짜 (KAN-330 리뷰 P1) — 게스트 이탈이 서버 로그아웃 전에 멈춘 자리.
private final class HeldReadTokenStore: TokenStore, @unchecked Sendable {
    private let inner = InMemoryTokenStore()
    private let lock = NSLock()
    private var holding = false
    private let (entered, enteredSignal) = AsyncStream<Void>.makeStream()
    private let (release, releaseSignal) = AsyncStream<Void>.makeStream()

    var tokens: AuthTokens? { inner.tokens }

    func holdNextRead() {
        lock.lock()
        holding = true
        lock.unlock()
    }

    func waitUntilReadHeld() async {
        for await _ in entered { break }
    }

    func releaseRead() { releaseSignal.yield() }

    func read() async -> AuthTokens? {
        let tokens = await inner.read()
        lock.lock()
        let held = holding
        holding = false
        lock.unlock()
        if held {
            enteredSignal.yield()
            for await _ in release { break }
        }
        return tokens
    }

    func save(_ tokens: AuthTokens) async -> Bool { await inner.save(tokens) }

    func clear() async { await inner.clear() }
}
