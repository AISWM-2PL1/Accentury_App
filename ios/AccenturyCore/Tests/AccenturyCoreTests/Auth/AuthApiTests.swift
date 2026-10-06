import XCTest
@testable import AccenturyCore

/// 안드로이드 `auth/AuthApiTest.kt`의 이식본 (KAN-224).
final class AuthApiTests: XCTestCase {

    private let loginBody = """
    {"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":true,
     "profileStatus":"INCOMPLETE","user":{"id":"u-1","provider":"KAKAO"}}
    """

    private var api: AuthApi!

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        // 저장소에 쌍이 있어도 로그인·갱신은 토큰 없이 나가야 한다 — 그걸 보려고 미리 채워 둔다.
        api = AuthClients(baseURL: "https://api.test/", store: InMemoryTokenStore(AuthTokens("jwt_a", "rt_a")), session: MockURLProtocol.makeSession()).api
    }

    override func tearDown() {
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func credential(_ provider: Provider) -> LoginCredential {
        switch provider {
        case .GOOGLE, .APPLE: return LoginCredential(provider: provider, idToken: "fake:g")
        case .KAKAO: return LoginCredential(provider: provider, accessToken: "fake:k")
        case .NAVER: return LoginCredential(provider: provider, accessToken: "fake:n", refreshToken: "fake:nr")
        }
    }

    private func lastBody() throws -> (raw: String, json: [String: Any]) {
        let data = try XCTUnwrap(MockURLProtocol.lastRequest()).body
        let raw = try XCTUnwrap(String(data: data, encoding: .utf8))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return (raw, json)
    }

    func test로그인_바디_구글은_idToken_동의와_방침_버전을_싣고_null_키는_없다() async throws {
        MockURLProtocol.respond(status: 200, body: loginBody)

        _ = await api.login(credential(.GOOGLE), privacyPolicyVersion: "2026-09")

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("POST", recorded.method)
        XCTAssertEqual("/v0/auth/login", recorded.url?.path)
        XCTAssertNil(recorded.header("Authorization"))
        let (raw, body) = try lastBody()
        XCTAssertFalse(raw.contains("null"), raw)
        XCTAssertEqual(["provider", "idToken", "privacyConsent", "privacyPolicyVersion"], Set(body.keys))
        XCTAssertEqual("GOOGLE", body["provider"] as? String)
        XCTAssertEqual("fake:g", body["idToken"] as? String)
        XCTAssertEqual(true, body["privacyConsent"] as? Bool)
        XCTAssertEqual("2026-09", body["privacyPolicyVersion"] as? String)
    }

    func test로그인_바디_카카오는_accessToken을_보낸다() async throws {
        MockURLProtocol.respond(status: 200, body: loginBody)

        _ = await api.login(credential(.KAKAO), privacyPolicyVersion: "v1")

        let body = try lastBody().json
        XCTAssertEqual(["provider", "accessToken", "privacyConsent", "privacyPolicyVersion"], Set(body.keys))
        XCTAssertEqual("fake:k", body["accessToken"] as? String)
    }

    func test로그인_바디_네이버는_accessToken과_refreshToken을_함께_보낸다() async throws {
        MockURLProtocol.respond(status: 200, body: loginBody)

        _ = await api.login(credential(.NAVER), privacyPolicyVersion: "v1")

        let body = try lastBody().json
        XCTAssertEqual(
            ["provider", "accessToken", "refreshToken", "privacyConsent", "privacyPolicyVersion"],
            Set(body.keys)
        )
        XCTAssertEqual("fake:n", body["accessToken"] as? String)
        XCTAssertEqual("fake:nr", body["refreshToken"] as? String)
    }

    func test로그인_바디_이름과_nonce는_줬을_때만_싣는다_애플_최초_로그인() async throws {
        MockURLProtocol.respond(status: 200, body: loginBody)

        _ = await api.login(
            LoginCredential(provider: .APPLE, idToken: "fake:a", nonce: "n-1", name: "홍길동"),
            privacyPolicyVersion: "v1"
        )

        let body = try lastBody().json
        XCTAssertEqual("APPLE", body["provider"] as? String)
        XCTAssertEqual("fake:a", body["idToken"] as? String)
        XCTAssertEqual("n-1", body["nonce"] as? String)
        XCTAssertEqual("홍길동", (body["user"] as? [String: Any])?["name"] as? String)
    }

    func test로그인_응답을_토큰_쌍과_계정으로_읽는다() async {
        MockURLProtocol.respond(status: 200, body: loginBody)

        let result = await api.login(credential(.KAKAO), privacyPolicyVersion: "v1")

        XCTAssertEqual(
            .success(
                LoginSuccess(
                    tokens: AuthTokens("jwt_1", "rt_1"),
                    isNewUser: true,
                    account: Account(profileStatus: .INCOMPLETE, user: AuthUser(id: "u-1", provider: .KAKAO))
                )
            ),
            result
        )
    }

    func test오류_봉투를_상태_코드와_함께_거절로_옮긴다() async {
        MockURLProtocol.respond(
            status: 401,
            body: #"{"code":"AUTH_IDP_TOKEN_INVALID","message":"로그인 정보를 확인하지 못했습니다.","retryable":false,"correlationId":"c"}"#
        )

        let result = await api.login(credential(.GOOGLE), privacyPolicyVersion: "v1")

        XCTAssertEqual(
            .rejected(status: 401, code: "AUTH_IDP_TOKEN_INVALID", message: "로그인 정보를 확인하지 못했습니다.", retryable: false, retryAfterMs: nil),
            result
        )
    }

    func test봉투_없는_502는_상태_코드로_재시도_가능_429는_RetryAfter를_읽는다() async {
        MockURLProtocol.respond(status: 502, body: "<html/>")
        let bad = await api.login(credential(.GOOGLE), privacyPolicyVersion: "v1")
        MockURLProtocol.respond(status: 429, body: "x", headers: ["Retry-After": "4"])
        let limited = await api.refresh("rt_a")

        guard case .rejected(let status, _, _, let retryable, _) = bad else { return XCTFail("\(bad)") }
        XCTAssertEqual(502, status)
        XCTAssertTrue(retryable)
        guard case .rejected(_, _, _, _, let retryAfterMs) = limited else { return XCTFail("\(limited)") }
        XCTAssertEqual(4_000, retryAfterMs)
    }

    func test성공_응답인데_토큰이_빠졌으면_재시도_가능한_거절이다() async {
        MockURLProtocol.respond(status: 200, body: #"{"accessToken":"jwt_1"}"#)

        let result = await api.refresh("rt_a")

        guard case .rejected(_, _, _, let retryable, _) = result else { return XCTFail("\(result)") }
        XCTAssertTrue(retryable)
    }

    func test프로필_제출은_Bearer로_PUT하고_계정을_돌려준다() async throws {
        MockURLProtocol.respond(status: 200, body: #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE","region":"SEOUL"}}"#)

        let result = await api.updateProfile(ProfileInput(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: "FEMALE", region: "SEOUL"))

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("PUT", recorded.method)
        XCTAssertEqual("/v0/users/me/profile", recorded.url?.path)
        XCTAssertEqual("Bearer jwt_a", recorded.header("Authorization"))
        let body = try lastBody().json
        XCTAssertEqual("2000-01-02", body["birthDate"] as? String)
        XCTAssertEqual("FEMALE", body["gender"] as? String)
        guard case .success(let account) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(.COMPLETE, account.profileStatus)
        XCTAssertEqual("SEOUL", account.user.region)
    }

    func test로그아웃은_204를_성공으로_본다() async throws {
        MockURLProtocol.respond(status: 204, body: "")

        let result = await api.logout("rt_a")

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("/v0/auth/logout", recorded.url?.path)
        XCTAssertEqual("Bearer jwt_a", recorded.header("Authorization"))
        XCTAssertEqual(#"{"refreshToken":"rt_a"}"#, try lastBody().raw)
        guard case .success = result else { return XCTFail("\(result)") }
    }

    // 음성 저장 선택 동의 (KAN-270). 안드로이드 `AuthApiTest`의 같은 이름 테스트와 짝이다.

    func test내_정보의_음성_저장_동의를_읽는다_동의_미동의_키_없음() async {
        let base = #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}"#
        MockURLProtocol.respondInOrder([
            (200, base + #","voiceConsent":{"consented":true,"version":"2026-10-04","consentedAt":"2026-10-06T01:02:03Z","currentVersion":"2026-10-04"}}"#),
            (200, base + #","voiceConsent":{"consented":false,"version":null,"consentedAt":null,"currentVersion":"2026-10-04"}}"#),
            (200, base + "}"),
        ])

        guard case .success(let first) = await api.me(),
              case .success(let second) = await api.me(),
              case .success(let third) = await api.me() else { return XCTFail() }

        XCTAssertEqual(
            VoiceConsent(consented: true, version: "2026-10-04", consentedAt: "2026-10-06T01:02:03Z", currentVersion: "2026-10-04"),
            first.voiceConsent
        )
        XCTAssertEqual(VoiceConsent(consented: false, currentVersion: "2026-10-04"), second.voiceConsent)
        XCTAssertNil(third.voiceConsent)
    }

    func test음성_저장_동의는_Bearer로_버전을_실어_PUT한다() async throws {
        MockURLProtocol.respond(
            status: 200,
            body: #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"},"voiceConsent":{"consented":true,"version":"2026-10-04","consentedAt":"2026-10-06T01:02:03Z","currentVersion":"2026-10-04"}}"#
        )

        let result = await api.consentToVoice(version: "2026-10-04")

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("PUT", recorded.method)
        XCTAssertEqual("/v0/users/me/voice-consent", recorded.url?.path)
        XCTAssertEqual("Bearer jwt_a", recorded.header("Authorization"))
        XCTAssertEqual(#"{"version":"2026-10-04"}"#, try lastBody().raw)
        guard case .success(let account) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(true, account.voiceConsent?.consented)
    }

    func test음성_저장_철회는_본문_없이_DELETE한다() async throws {
        MockURLProtocol.respond(
            status: 200,
            body: #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"},"voiceConsent":{"consented":false,"currentVersion":"2026-10-04"}}"#
        )

        let result = await api.withdrawVoiceConsent()

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("DELETE", recorded.method)
        XCTAssertEqual("/v0/users/me/voice-consent", recorded.url?.path)
        XCTAssertEqual("Bearer jwt_a", recorded.header("Authorization"))
        XCTAssertTrue(recorded.body.isEmpty)
        guard case .success(let account) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(false, account.voiceConsent?.consented)
    }

    func test낡은_버전의_동의는_400_봉투_그대로_거절이다() async {
        MockURLProtocol.respond(status: 400, body: #"{"code":"VALIDATION_FAILED","message":"m","retryable":false,"correlationId":"c"}"#)

        let result = await api.consentToVoice(version: "2026-09-29")

        guard case .rejected(let status, let code, _, let retryable, _) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(400, status)
        XCTAssertEqual("VALIDATION_FAILED", code)
        XCTAssertFalse(retryable)
    }

    func test서버가_없으면_전송_실패다() async {
        MockURLProtocol.fail(with: URLError(.cannotConnectToHost))

        let result = await api.me()

        guard case .transportError = result else { return XCTFail("\(result)") }
    }

    func test토큰과_개인_정보는_설명에_찍히지_않는다() {
        let printed = [
            String(describing: AuthTokens("jwt_secret", "rt_secret")),
            String(reflecting: AuthTokens("jwt_secret", "rt_secret")),
            String(describing: LoginCredential(provider: .GOOGLE, idToken: "id_secret", nonce: "nonce_secret", name: "홍길동")),
            String(describing: AuthUser(id: "u-1", provider: .GOOGLE, email: "me@x.co", name: "홍길동")),
            String(describing: ProfileInput(email: "me@x.co", name: "홍길동", birthDate: "2000-01-02", gender: "MALE", region: "SEOUL")),
        ].joined(separator: ",")

        for secret in ["jwt_secret", "rt_secret", "id_secret", "nonce_secret", "홍길동", "me@x.co", "2000-01-02"] {
            XCTAssertFalse(printed.contains(secret), printed)
        }
    }
}
