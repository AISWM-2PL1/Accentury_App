import XCTest
@testable import AccenturyCore

/// 안드로이드 `auth/AuthGateControllerTest.kt`의 이식본 (KAN-224). 같은 전이를 같은 응답으로 겨눈다.
@MainActor
final class AuthGateControllerTests: XCTestCase {

    private let user = AuthUser(id: "u-1", provider: .GOOGLE)
    private let google = LoginCredential(provider: .GOOGLE, idToken: "fake:g")
    private let profile = ProfileInput(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: "MALE", region: "SEOUL")
    private let incompleteLogin = """
    {"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":true,
     "profileStatus":"INCOMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}
    """

    private func account(_ status: String, voiceConsent: String? = nil) -> String {
        #"{"profileStatus":"\#(status)","user":{"id":"u-1","provider":"GOOGLE"}"# + (voiceConsent.map { #","voiceConsent":\#($0)"# } ?? "") + "}"
    }
    private func consent(_ consented: Bool) -> String {
        consented
            ? #"{"consented":true,"version":"2026-10-04","consentedAt":"2026-10-06T01:02:03Z","currentVersion":"2026-10-04"}"#
            : #"{"consented":false,"version":null,"consentedAt":null,"currentVersion":"2026-10-04"}"#
    }
    private let loginComplete = """
    {"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":false,
     "profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}
    """
    private let notConsented = VoiceConsent(consented: false, currentVersion: "2026-10-04")
    private let consented = VoiceConsent(consented: true, version: "2026-10-04", consentedAt: "2026-10-06T01:02:03Z", currentVersion: "2026-10-04")
    private func tokens(_ n: Int) -> String { #"{"accessToken":"jwt_\#(n)","refreshToken":"rt_\#(n)","accessTokenExpiresInSec":900}"# }
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

    private func controller(
        _ store: TokenStore,
        logoutServerTimeout: Duration = .seconds(10),
        logoutIdpTimeout: Duration = .seconds(5)
    ) -> (AuthGateController, AuthClients) {
        let clients = AuthClients(baseURL: "https://api.test/", store: store, session: MockURLProtocol.makeSession())
        let gate = AuthGateController(
            api: clients.api,
            store: store,
            refresher: clients.refresher,
            logoutServerTimeout: logoutServerTimeout,
            logoutIdpTimeout: logoutIdpTimeout
        )
        return (gate, clients)
    }

    func test저장된_토큰이_없으면_서버에_묻지_않고_로그인_화면이다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        XCTAssertEqual(.checking, gate.state)

        await gate.bootstrap()

        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertEqual(0, MockURLProtocol.requestCount)
    }

    func test로그인_INCOMPLETE는_추가_정보로_제출이_COMPLETE면_들어간다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, incompleteLogin), (200, account("COMPLETE"))])

        await gate.login(google, privacyPolicyVersion: "v1")
        XCTAssertEqual(.needsProfile(user, error: nil), gate.state)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)

        await gate.submitProfile(profile)
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        XCTAssertEqual("Bearer jwt_1", MockURLProtocol.requests()[1].header("Authorization"))
    }

    func test재시작_때_저장된_Refresh가_살아_있으면_갱신_후_곧장_들어간다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, account("COMPLETE"))])

        await gate.bootstrap()

        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        let requests = MockURLProtocol.requests()
        XCTAssertEqual("/v0/auth/refresh", requests[0].url?.path)
        XCTAssertEqual("Bearer jwt_1", requests[1].header("Authorization"))
    }

    func test재시작_때_Refresh가_거절되면_저장소를_비우고_로그인_화면이다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(401, envelope("AUTH_REFRESH_INVALID", false))])

        await gate.bootstrap()

        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertNil(store.tokens)
    }

    func test재시작_때_서버가_503이면_토큰을_두고_다시_시도_안내를_낸다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(503, envelope("AUTH_STORE_UNAVAILABLE", true))])

        await gate.bootstrap()

        XCTAssertEqual(.checkFailed(AuthFailure(.retryLater)), gate.state)
        XCTAssertEqual(AuthTokens("jwt_0", "rt_0"), store.tokens)
    }

    func test만_14세_미만이면_추가_정보_화면에_남아_사유를_보인다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        MockURLProtocol.respondInOrder([(200, incompleteLogin), (400, envelope("AUTH_UNDER_AGE", false))])

        await gate.login(google, privacyPolicyVersion: "v1")
        await gate.submitProfile(profile)

        XCTAssertEqual(.needsProfile(user, error: AuthFailure(.underAge)), gate.state)
    }

    func test로그인_실패는_갈래별_안내로_접힌다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        let cases: [((Int, String), AuthFailure)] = [
            ((401, envelope("AUTH_IDP_TOKEN_INVALID", false)), AuthFailure(.retry)),
            ((502, envelope("AUTH_IDP_UNAVAILABLE", true)), AuthFailure(.retryLater)),
            ((429, #"{"code":"RATE_LIMITED","message":"m","retryable":true,"retryAfterMs":2100,"correlationId":"c"}"#),
             AuthFailure(.rateLimited, retryAfterSeconds: 3)),
            ((400, envelope("AUTH_CONSENT_REQUIRED", false)), AuthFailure(.unsupported)),
        ]
        for (response, expected) in cases {
            MockURLProtocol.respond(status: response.0, body: response.1)
            await gate.login(google, privacyPolicyVersion: "v1")
            XCTAssertEqual(.signedOut(expected), gate.state)
        }
    }

    func test로그인_전송_실패는_다시_시도_갈래다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        MockURLProtocol.fail(with: URLError(.cannotConnectToHost))

        await gate.login(google, privacyPolicyVersion: "v1")

        XCTAssertEqual(.signedOut(AuthFailure(.retry)), gate.state)
    }

    func test로그인_토큰_저장이_실패하면_들어가지_않고_다시_시도_안내와_빈_저장소로_남는다() async {
        let store = InMemoryTokenStore()
        store.persists = false
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, incompleteLogin)])

        await gate.login(google, privacyPolicyVersion: "v1")

        XCTAssertEqual(.signedOut(AuthFailure(.retry)), gate.state)
        XCTAssertNil(store.tokens)
    }

    func test세션_생성이_프로필_미완료로_막히면_추가_정보_화면으로_돌아간다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, account("COMPLETE"))])
        await gate.bootstrap()

        gate.onProfileIncomplete()

        XCTAssertEqual(.needsProfile(user, error: nil), gate.state)
    }

    func test로그아웃은_서버가_실패해도_로컬_토큰을_지우고_IdP_로그아웃도_부른다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(503, envelope("AUTH_STORE_UNAVAILABLE", true))])
        var idpLoggedOut = false

        await gate.logout { idpLoggedOut = true }

        XCTAssertNil(store.tokens)
        XCTAssertTrue(idpLoggedOut)
        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertEqual("/v0/auth/logout", MockURLProtocol.requests().first?.url?.path)
    }

    // 설정 화면 로그아웃 (KAN-247). 안드로이드 `AuthGateControllerTest`의 같은 이름 테스트와 짝이다. IdP 로그아웃이
    // 던지는 경우는 iOS에 없다 — `idpLogout`이 던지지 않는 시그니처다(`IdpLogout.all`이 SDK 실패를 삼킨다).
    func test설정_화면_로그아웃은_서버가_받으면_저장소를_비우고_IdP_로그아웃_뒤_로그인_화면이다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(204, "")])
        var idpLoggedOut = false

        await gate.logout { idpLoggedOut = true }

        XCTAssertNil(store.tokens)
        XCTAssertTrue(idpLoggedOut)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    // 로그아웃 단계별 시간 상한 (KAN-247). 안드로이드 `AuthGateControllerTest`의 시간 상한 테스트와 짝이다.
    func testIdP_로그아웃_콜백이_끝내_안_와도_상한_뒤_저장소를_비우고_로그인_화면이다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store, logoutIdpTimeout: .milliseconds(100))
        MockURLProtocol.respondInOrder([(204, "")])
        let started = ContinuousClock.now

        // SDK가 콜백을 부르지 않는 경우 — 붙잡아 두고 재개하지 않는 continuation이다. 취소에도 응하지 않는다.
        var sdkCallback: CheckedContinuation<Void, Never>?
        await gate.logout { await withCheckedContinuation { sdkCallback = $0 } }

        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2))
        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
        sdkCallback?.resume() // 뒤에 남은 작업을 풀어 준다 — 버리면 continuation 누수 경고가 뜬다
    }

    func test서버가_답하지_않아도_상한_뒤_IdP_로그아웃을_부르고_로그인_화면이다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store, logoutServerTimeout: .milliseconds(100))
        MockURLProtocol.hang()
        var idpLoggedOut = false
        let started = ContinuousClock.now

        await gate.logout { idpLoggedOut = true }

        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2))
        XCTAssertTrue(idpLoggedOut)
        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertEqual("/v0/auth/logout", MockURLProtocol.requests().first?.url?.path)
    }

    func test시간_상한_작업이_먼저_끝나면_기다리지_않고_돌아온다() async {
        var finished = false
        let started = ContinuousClock.now

        await withDeadline(.seconds(5)) { finished = true }

        XCTAssertTrue(finished)
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(1))
    }

    func test시간_상한을_넘기면_작업을_두고_돌아온다() async {
        var finished = false
        let started = ContinuousClock.now

        await withDeadline(.milliseconds(100)) {
            try? await Task.sleep(for: .seconds(5))
            finished = true
        }

        XCTAssertFalse(finished)
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2))
    }

    func test로그아웃_전송이_실패해도_저장소를_비우고_로그인_화면이다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.fail(with: URLError(.notConnectedToInternet))

        await gate.logout()

        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    func test추가_정보_화면에서_다른_계정으로_로그인하면_저장소를_비우고_로그인_화면이다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, incompleteLogin), (204, "")])
        await gate.login(google, privacyPolicyVersion: "v1")
        XCTAssertEqual(.needsProfile(user, error: nil), gate.state)

        await gate.logout()

        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    func test다른_요청에서_Refresh가_거절되면_게이트가_로그인_화면으로_돌아간다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, clients) = controller(store)
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, account("COMPLETE"))])
        await gate.bootstrap()
        // 예: 세션 생성이 401 → 인증 전송이 갱신 → 갱신 401
        MockURLProtocol.respondInOrder([
            (401, envelope("AUTH_TOKEN_INVALID", false)),
            (401, envelope("AUTH_REFRESH_REUSED", false)),
        ])

        _ = await clients.api.me()

        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertNil(store.tokens)
    }
    // 음성 저장 선택 동의 (KAN-270). 안드로이드 `AuthGateControllerTest`의 같은 이름 테스트와 짝이다.

    func test로그인으로_곧장_들어가면_me를_한_번_더_불러_음성_동의를_채운다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        MockURLProtocol.respondInOrder([(200, loginComplete), (200, account("COMPLETE", voiceConsent: consent(false)))])

        await gate.login(google, privacyPolicyVersion: "v1")

        XCTAssertEqual(.signedIn(user, voiceConsent: notConsented), gate.state)
        let requests = MockURLProtocol.requests()
        XCTAssertEqual("/v0/auth/login", requests[0].url?.path)
        XCTAssertEqual("/v0/users/me", requests[1].url?.path)
        XCTAssertEqual("Bearer jwt_1", requests[1].header("Authorization"))
    }

    func test로그인_뒤_me가_5xx여도_동의를_모르는_채_들어간다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, loginComplete), (503, envelope("AUTH_STORE_UNAVAILABLE", true))])

        await gate.login(google, privacyPolicyVersion: "v1")

        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
    }

    func test시작_확인과_프로필_제출은_응답의_음성_동의를_싣는다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([
            (200, tokens(1)), (200, account("INCOMPLETE")), (200, account("COMPLETE", voiceConsent: consent(false))),
        ])
        await gate.bootstrap()

        await gate.submitProfile(profile)

        XCTAssertEqual(.signedIn(user, voiceConsent: notConsented), gate.state)
    }

    func test동의는_서버가_준_currentVersion을_PUT에_싣고_상태를_갱신한다() async throws {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([
            (200, tokens(1)), (200, account("COMPLETE", voiceConsent: consent(false))),
            (200, account("COMPLETE", voiceConsent: consent(true))),
        ])
        await gate.bootstrap()

        let result = await gate.setVoiceConsent(true)

        guard case .success = result else { return XCTFail("\(result)") }
        XCTAssertEqual(.signedIn(user, voiceConsent: consented), gate.state)
        let put = MockURLProtocol.requests()[2]
        XCTAssertEqual("PUT", put.method)
        XCTAssertEqual("/v0/users/me/voice-consent", put.url?.path)
        XCTAssertEqual(#"{"version":"2026-10-04"}"#, String(data: put.body, encoding: .utf8))
    }

    func test동의_상태를_모르면_me로_버전을_먼저_읽고_동의한다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([
            (200, tokens(1)), (200, account("COMPLETE")),
            (200, account("COMPLETE", voiceConsent: consent(false))), (200, account("COMPLETE", voiceConsent: consent(true))),
        ])
        await gate.bootstrap()

        _ = await gate.setVoiceConsent(true)

        XCTAssertEqual(.signedIn(user, voiceConsent: consented), gate.state)
        let requests = MockURLProtocol.requests()
        XCTAssertEqual("/v0/users/me", requests[2].url?.path)
        XCTAssertEqual(#"{"version":"2026-10-04"}"#, String(data: requests[3].body, encoding: .utf8))
    }

    func test철회는_DELETE_뒤_미동의로_바뀐다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([
            (200, tokens(1)), (200, account("COMPLETE", voiceConsent: consent(true))),
            (200, account("COMPLETE", voiceConsent: consent(false))),
        ])
        await gate.bootstrap()

        _ = await gate.setVoiceConsent(false)

        XCTAssertEqual(.signedIn(user, voiceConsent: notConsented), gate.state)
        XCTAssertEqual("DELETE", MockURLProtocol.requests()[2].method)
    }

    func test동의_변경이_실패하면_상태는_그대로이고_결과를_돌려준다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([
            (200, tokens(1)), (200, account("COMPLETE", voiceConsent: consent(false))),
            (503, envelope("AUTH_STORE_UNAVAILABLE", true)),
        ])
        await gate.bootstrap()

        let result = await gate.setVoiceConsent(true)

        guard case .rejected = result else { return XCTFail("\(result)") }
        XCTAssertEqual(.signedIn(user, voiceConsent: notConsented), gate.state)
    }

    func test로그인_상태가_아니면_동의_변경은_아무것도_보내지_않는다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        await gate.bootstrap()

        let result = await gate.setVoiceConsent(true)
        await gate.reloadVoiceConsent()

        guard case .rejected = result else { return XCTFail("\(result)") }
        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertEqual(0, MockURLProtocol.requestCount)
    }

    func test다시_읽기는_me로_동의_상태를_채운다() async {
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        MockURLProtocol.respondInOrder([
            (200, tokens(1)), (200, account("COMPLETE")), (200, account("COMPLETE", voiceConsent: consent(true))),
        ])
        await gate.bootstrap()

        await gate.reloadVoiceConsent()

        XCTAssertEqual(.signedIn(user, voiceConsent: consented), gate.state)
    }
}
