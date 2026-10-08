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
        logoutIdpTimeout: Duration = .seconds(5),
        withdrawServerTimeout: Duration = .seconds(30)
    ) -> (AuthGateController, AuthClients) {
        let clients = AuthClients(baseURL: "https://api.test/", store: store, session: MockURLProtocol.makeSession())
        let gate = AuthGateController(
            api: clients.api,
            store: store,
            refresher: clients.refresher,
            logoutServerTimeout: logoutServerTimeout,
            logoutIdpTimeout: logoutIdpTimeout,
            withdrawServerTimeout: withdrawServerTimeout
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

    func test로그인_뒤_me에서_갱신이_거절돼_저장소가_비면_로그인_화면이다() async {
        let store = InMemoryTokenStore()
        let (gate, _) = controller(store)
        // me 401 → 인증 전송이 갱신 → 갱신 401 → 저장소 비움. signedIn으로 덮으면 안 된다(리뷰 P2-5).
        MockURLProtocol.respondInOrder([
            (200, loginComplete), (401, envelope("AUTH_TOKEN_INVALID", false)), (401, envelope("AUTH_REFRESH_REUSED", false)),
        ])

        await gate.login(google, privacyPolicyVersion: "v1")

        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertNil(store.tokens)
    }

    func test로그인_응답은_COMPLETE여도_뒤이은_me가_INCOMPLETE면_추가_정보_화면이다() async {
        let (gate, _) = controller(InMemoryTokenStore())
        MockURLProtocol.respondInOrder([(200, loginComplete), (200, account("INCOMPLETE"))])

        await gate.login(google, privacyPolicyVersion: "v1")

        // 더 새 정보(me)가 이긴다(리뷰 P2-5).
        XCTAssertEqual(.needsProfile(user, error: nil), gate.state)
    }

    func test동의_요청_중_로그아웃이_끝나면_늦게_온_응답이_로그인_상태로_되돌리지_않는다() async throws {
        // 로그아웃 서버 호출은 상한(0.1초)으로 끝낸다 — PUT이 전송 스레드를 막고 있어도 로그아웃이 마저 끝나게.
        let (gate, _) = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")), logoutServerTimeout: .milliseconds(100))
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, account("COMPLETE", voiceConsent: consent(false)))])
        await gate.bootstrap()
        // PUT 응답을 문으로 막아 두고 그 사이에 로그아웃을 끝낸다(리뷰 P2-5).
        let release = DispatchSemaphore(value: 0)
        let late = Data(account("COMPLETE", voiceConsent: consent(true)).utf8)
        MockURLProtocol.setHandler { request in
            if request.httpMethod == "PUT" { _ = release.wait(timeout: .now() + 5) }
            return (HTTPURLResponse(url: request.url!, statusCode: request.httpMethod == "PUT" ? 200 : 204, httpVersion: "HTTP/1.1", headerFields: nil)!, request.httpMethod == "PUT" ? late : Data())
        }

        let consentTask = Task { await gate.setVoiceConsent(true) }
        for _ in 0..<500 where MockURLProtocol.lastRequest()?.method != "PUT" { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual("PUT", MockURLProtocol.lastRequest()?.method)
        await gate.logout()
        release.signal()
        _ = await consentTask.value

        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    // 회원 탈퇴 (KAN-251). 안드로이드 `AuthGateControllerTest`의 같은 이름 테스트와 짝이다.

    func test탈퇴_204면_토큰을_지우고_IdP_정리_뒤_로그인_화면이며_서버_로그아웃은_부르지_않는다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(204, "")])
        var idpLoggedOut = false

        let outcome = await gate.withdraw { idpLoggedOut = true }

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertNil(store.tokens)
        XCTAssertTrue(idpLoggedOut)
        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertEqual(["/v0/users/me/withdrawal"], MockURLProtocol.requests().map { $0.url?.path })
    }

    func test탈퇴_401은_이미_탈퇴된_계정이라_탈퇴됨으로_정리한다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        // bootstrap이 로그아웃 훅을 건다 — 실제 로그인 상태에서 훅이 먼저 로그인 화면으로 돌리는 경로를 겨눈다(KAN-251 리뷰 P1).
        // 탈퇴 401 → 갱신 → 서버가 Refresh를 이미 폐기해 401. 갱신 거절이 저장소를 먼저 비워도 IdP 정리는 빠지지 않는다.
        MockURLProtocol.respondInOrder([
            (200, tokens(1)),
            (200, account("COMPLETE")),
            (401, envelope("AUTH_TOKEN_INVALID", false)),
            (401, envelope("AUTH_REFRESH_INVALID", false)),
        ])
        await gate.bootstrap()
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        var stateDuringIdp: AuthGateState?

        let outcome = await gate.withdraw { stateDuringIdp = gate.state }

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertEqual(.signedOut(nil), stateDuringIdp, "갱신 거절 훅이 IdP 정리 전에 로그인 화면으로 돌렸다")
        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertEqual(
            ["/v0/auth/refresh", "/v0/users/me", "/v0/users/me/withdrawal", "/v0/auth/refresh"],
            MockURLProtocol.requests().map { $0.url?.path }
        )
    }

    func test탈퇴_401_뒤_IdP_정리_대기_중에_새로_로그인하면_새_토큰과_상태를_지우지_않는다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([
            (200, tokens(2)),
            (200, account("COMPLETE")),
            (401, envelope("AUTH_TOKEN_INVALID", false)),
            (401, envelope("AUTH_REFRESH_INVALID", false)),
            (200, loginComplete),
            (200, account("COMPLETE")),
        ])
        await gate.bootstrap()
        let (entered, enteredSignal) = AsyncStream<Void>.makeStream()
        let (release, releaseSignal) = AsyncStream<Void>.makeStream()

        let withdrawal = Task {
            await gate.withdraw {
                enteredSignal.yield()
                for await _ in release { break }
            }
        }
        for await _ in entered { break }
        XCTAssertEqual(.signedOut(nil), gate.state)
        XCTAssertNil(store.tokens)
        await gate.login(google, privacyPolicyVersion: "v1")
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        releaseSignal.yield()
        let outcome = await withdrawal.value

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
    }

    func test탈퇴_서버_단계가_끝나기_전에_완료된_새_로그인을_정리가_지우지_않는다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, clients) = controller(store)
        MockURLProtocol.respondInOrder([
            (200, tokens(2)),
            (200, account("COMPLETE")),
            (401, envelope("AUTH_TOKEN_INVALID", false)),
            (401, envelope("AUTH_REFRESH_INVALID", false)),
            (200, loginComplete),
            (200, account("COMPLETE")),
        ])
        await gate.bootstrap()
        // URLSession은 본문까지 받은 뒤 갱신하므로 본문을 늦출 수 없다. 대신 갱신 거절 훅을 붙잡아 탈퇴 서버 단계가 끝나기
        // 전에 새 로그인을 끝낸다(KAN-251 리뷰 P1 재검증 3). 정리 시작 때 세대를 잡으면 새 로그인의 세대라 새 토큰을 지운다.
        let (entered, enteredSignal) = AsyncStream<Void>.makeStream()
        let (release, releaseSignal) = AsyncStream<Void>.makeStream()
        await clients.refresher.setOnSignedOut {
            enteredSignal.yield()
            for await _ in release { break }
        }

        let withdrawal = Task { await gate.withdraw() }
        for await _ in entered { break }
        XCTAssertNil(store.tokens)
        await gate.login(google, privacyPolicyVersion: "v1")
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        releaseSignal.yield()
        let outcome = await withdrawal.value

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
    }

    func test탈퇴_정리가_저장_중인_새_로그인_토큰을_지우지_않는다() async throws {
        let store = HeldSaveTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([
            (200, tokens(2)),
            (200, account("COMPLETE")),
            (401, envelope("AUTH_TOKEN_INVALID", false)),
            (401, envelope("AUTH_REFRESH_INVALID", false)),
            (200, loginComplete),
            (200, account("COMPLETE")),
        ])
        await gate.bootstrap()
        let (idpEntered, idpEnteredSignal) = AsyncStream<Void>.makeStream()
        let (idpRelease, idpReleaseSignal) = AsyncStream<Void>.makeStream()

        let withdrawal = Task {
            await gate.withdraw {
                idpEnteredSignal.yield()
                for await _ in idpRelease { break }
            }
        }
        for await _ in idpEntered { break }
        // 새 로그인의 저장이 저장소 잠금 안에서 붙잡힌 사이 IdP 정리를 끝낸다(KAN-251 리뷰 P1 재검증 2).
        store.holdNextSave()
        let login = Task { await gate.login(google, privacyPolicyVersion: "v1") }
        await store.waitUntilSaveHeld()
        idpReleaseSignal.yield()
        try await Task.sleep(for: .milliseconds(200))
        store.releaseSave()
        await login.value
        let outcome = await withdrawal.value

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
    }

    func test탈퇴_정리_중에_앞서_시작된_갱신이_끝나도_새_로그인이_아니라_정리를_마친다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, account("COMPLETE")), (204, "")])
        await gate.bootstrap()
        // 탈퇴 전에 시작된 기존 세션 갱신. 응답을 붙잡아 두었다가 IdP 정리 중에 풀어 쌍을 jwt_2로 바꾼다(KAN-251 리뷰 P1 재검증).
        let (held, releaseRefresh) = AsyncStream<Void>.makeStream()
        let refresher = TokenRefresher(store: store) { _ in
            for await _ in held { break }
            return .success(AuthTokens("jwt_2", "rt_2"))
        }
        let refreshing = Task { await refresher.refresh(staleAccess: nil) }

        let outcome = await gate.withdraw {
            releaseRefresh.yield()
            _ = await refreshing.value
        }

        XCTAssertEqual(.withdrawn, outcome)
        let refreshed = await refreshing.value
        XCTAssertEqual(.refreshed(AuthTokens("jwt_2", "rt_2")), refreshed)
        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    func test탈퇴_429면_탈퇴_안_됨으로_토큰을_두고_대기_시간을_알린다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([
            (429, #"{"code":"RATE_LIMITED","message":"m","retryable":true,"retryAfterMs":2100,"correlationId":"c"}"#),
        ])
        var idpLoggedOut = false

        let outcome = await gate.withdraw { idpLoggedOut = true }

        XCTAssertEqual(.failed(AuthFailure(.rateLimited, retryAfterSeconds: 3)), outcome)
        XCTAssertEqual(AuthTokens("jwt_0", "rt_0"), store.tokens)
        XCTAssertFalse(idpLoggedOut)
        XCTAssertEqual(1, MockURLProtocol.requestCount)
    }

    func test탈퇴_503이면_토큰과_로그인_상태를_그대로_두고_실패를_돌려준다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.respondInOrder([
            (200, tokens(1)),
            (200, account("COMPLETE")),
            (503, envelope("AUTH_STORE_UNAVAILABLE", true)),
        ])
        await gate.bootstrap()
        let signedIn = gate.state
        var idpLoggedOut = false

        let outcome = await gate.withdraw { idpLoggedOut = true }

        XCTAssertEqual(.failed(AuthFailure(.retryLater)), outcome)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertFalse(idpLoggedOut)
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), signedIn)
        XCTAssertEqual(signedIn, gate.state)
    }

    func test탈퇴_전송이_실패하면_토큰과_상태를_그대로_두고_실패를_돌려준다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        MockURLProtocol.fail(with: URLError(.notConnectedToInternet))
        var idpLoggedOut = false

        let outcome = await gate.withdraw { idpLoggedOut = true }

        XCTAssertEqual(.failed(AuthFailure(.retry)), outcome)
        XCTAssertEqual(AuthTokens("jwt_0", "rt_0"), store.tokens)
        XCTAssertFalse(idpLoggedOut)
        XCTAssertEqual(.checking, gate.state)
    }

    func test탈퇴_서버_응답이_상한을_넘기면_탈퇴_안_됨으로_토큰을_둔다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store, withdrawServerTimeout: .milliseconds(100))
        MockURLProtocol.hang()
        var idpLoggedOut = false
        let started = ContinuousClock.now

        let outcome = await gate.withdraw { idpLoggedOut = true }

        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2))
        XCTAssertEqual(.failed(AuthFailure(.retry)), outcome)
        XCTAssertEqual(AuthTokens("jwt_0", "rt_0"), store.tokens)
        XCTAssertFalse(idpLoggedOut)
    }

    func test탈퇴_상한_뒤에_늦게_온_401은_갱신하지_않아_실패와_로그인_상태가_유지된다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store, withdrawServerTimeout: .milliseconds(100))
        MockURLProtocol.respondInOrder([(200, tokens(1)), (200, account("COMPLETE"))])
        await gate.bootstrap()
        let rejected = Data(envelope("AUTH_TOKEN_INVALID", false).utf8)
        // 탈퇴 응답은 상한(100ms) 뒤에 401로 온다. 취소가 없으면 이 401이 갱신 → 갱신 401로 저장소를 비운다(KAN-251 리뷰 P0).
        MockURLProtocol.setHandler { request in
            if request.url?.path == "/v0/users/me/withdrawal" { Thread.sleep(forTimeInterval: 0.3) }
            return (HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: "HTTP/1.1", headerFields: nil)!, rejected)
        }
        var idpLoggedOut = false

        let outcome = await gate.withdraw { idpLoggedOut = true }
        try await Task.sleep(for: .milliseconds(600))

        XCTAssertEqual(.failed(AuthFailure(.retry)), outcome)
        XCTAssertEqual(AuthTokens("jwt_1", "rt_1"), store.tokens)
        XCTAssertEqual(.signedIn(user, voiceConsent: nil), gate.state)
        XCTAssertFalse(idpLoggedOut)
        XCTAssertEqual(
            ["/v0/auth/refresh", "/v0/users/me", "/v0/users/me/withdrawal"],
            MockURLProtocol.requests().map { $0.url?.path }
        )
    }

    func test진행_중에_다시_탈퇴를_불러도_서버_요청은_한_번이고_같은_결과를_받는다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        let release = DispatchSemaphore(value: 0)
        MockURLProtocol.setHandler { request in
            _ = release.wait(timeout: .now() + 5)
            return (HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: "HTTP/1.1", headerFields: nil)!, Data())
        }
        var idpCalls = 0

        let first = Task { await gate.withdraw { idpCalls += 1 } }
        for _ in 0..<500 where MockURLProtocol.requestCount == 0 { try await Task.sleep(for: .milliseconds(10)) }
        let second = Task { await gate.withdraw { idpCalls += 1 } }
        await Task.yield()
        release.signal()

        let firstOutcome = await first.value
        let secondOutcome = await second.value
        XCTAssertEqual(.withdrawn, firstOutcome)
        XCTAssertEqual(.withdrawn, secondOutcome)
        XCTAssertEqual(1, MockURLProtocol.requestCount)
        XCTAssertEqual(1, idpCalls)
        XCTAssertNil(store.tokens)
    }

    func test탈퇴가_서버_응답_대기_중_취소돼도_IdP_정리와_로컬_정리까지_끝낸다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        let (gate, _) = controller(store)
        let release = DispatchSemaphore(value: 0)
        MockURLProtocol.setHandler { request in
            _ = release.wait(timeout: .now() + 5)
            return (HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: "HTTP/1.1", headerFields: nil)!, Data())
        }
        var idpLoggedOut = false

        let screen = Task { await gate.withdraw { idpLoggedOut = true } }
        for _ in 0..<500 where MockURLProtocol.requestCount == 0 { try await Task.sleep(for: .milliseconds(10)) }
        screen.cancel()
        release.signal()
        let outcome = await screen.value

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertTrue(idpLoggedOut)
        XCTAssertNil(store.tokens)
        XCTAssertEqual(.signedOut(nil), gate.state)
    }

    // 애플 재인증 갈래 (KAN-251, iOS만). 안드로이드에는 애플 로그인이 없다.

    func test애플_재인증을_취소하면_탈퇴를_멈추고_서버에_보내지_않는다() async {
        var sent: [String?] = []

        let outcome = await withdrawAccount(provider: .APPLE, appleReauth: { .cancelled }) { sent.append($0); return .withdrawn }

        XCTAssertNil(outcome)
        XCTAssertTrue(sent.isEmpty)
    }

    func test애플_재인증이_실패하면_코드_없이_탈퇴한다() async {
        var sent: [String?] = []

        let outcome = await withdrawAccount(provider: .APPLE, appleReauth: { .failed }) { sent.append($0); return .withdrawn }

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertEqual([nil], sent)
    }

    func test애플_재인증이_성공하면_코드를_실어_탈퇴한다() async {
        var sent: [String?] = []

        let outcome = await withdrawAccount(provider: .APPLE, appleReauth: { .code("c_apple") }) { sent.append($0); return .failed(AuthFailure(.retry)) }

        XCTAssertEqual(.failed(AuthFailure(.retry)), outcome)
        XCTAssertEqual(["c_apple"], sent)
    }

    func test애플이_아닌_계정은_재인증_없이_코드_없이_탈퇴한다() async {
        var reauthCalls = 0
        var sent: [String?] = []

        let outcome = await withdrawAccount(provider: .KAKAO, appleReauth: { reauthCalls += 1; return .code("x") }) {
            sent.append($0)
            return .withdrawn
        }

        XCTAssertEqual(.withdrawn, outcome)
        XCTAssertEqual(0, reauthCalls)
        XCTAssertEqual([nil], sent)
    }

    func test애플_재인증_코드는_설명에_남지_않는다() {
        XCTAssertFalse("\(AppleReauth.code("c_apple"))".contains("c_apple"))
    }
}

/// 실제 키체인 저장소처럼 save·clear를 한 줄로 세우고, 다음 save 한 번을 풀 때까지 붙잡는 가짜 (KAN-251 리뷰 P1 재검증 2).
/// 줄을 세우는 이유: 붙잡힌 save 뒤에 온 clear는 save가 끝난 뒤에 돈다 — 고치기 전 코드의 경합이 이 순서에서 난다.
private final class HeldSaveTokenStore: TokenStore, @unchecked Sendable {
    private let inner: InMemoryTokenStore
    private let lock = NSLock()
    private var tail: Task<Void, Never>?
    private var hold: (entered: AsyncStream<Void>.Continuation, release: AsyncStream<Void>)?
    private var enteredStream: AsyncStream<Void>?
    private var releaseSignal: AsyncStream<Void>.Continuation?

    init(_ initial: AuthTokens?) { inner = InMemoryTokenStore(initial) }

    var tokens: AuthTokens? { inner.tokens }

    func holdNextSave() {
        let (entered, enteredSignal) = AsyncStream<Void>.makeStream()
        let (release, releaseSignal) = AsyncStream<Void>.makeStream()
        lock.lock()
        hold = (enteredSignal, release)
        enteredStream = entered
        self.releaseSignal = releaseSignal
        lock.unlock()
    }

    func waitUntilSaveHeld() async {
        lock.lock()
        let entered = enteredStream
        lock.unlock()
        for await _ in entered ?? AsyncStream { $0.finish() } { break }
    }

    func releaseSave() {
        lock.lock()
        let signal = releaseSignal
        lock.unlock()
        signal?.yield()
    }

    private func serial<T: Sendable>(_ body: @escaping @Sendable () async -> T) async -> T {
        lock.lock()
        let previous = tail
        let task = Task { _ = await previous?.value; return await body() }
        tail = Task { _ = await task.value }
        lock.unlock()
        return await task.value
    }

    func read() async -> AuthTokens? { await inner.read() }

    func save(_ tokens: AuthTokens) async -> Bool {
        await serial { [self] in
            lock.lock()
            let held = hold
            hold = nil
            lock.unlock()
            if let held {
                held.entered.yield()
                for await _ in held.release { break }
            }
            return await inner.save(tokens)
        }
    }

    func clear() async {
        await serial { [self] in await inner.clear() }
    }
}
