import XCTest
@testable import AccenturyCore

/// 안드로이드 `auth/TokenAuthenticatorTest.kt`의 이식본 (KAN-224). ``AuthorizedSession``(Bearer + 401 갱신)과
/// ``TokenRefresher``(한 번에 하나)를 진짜 요청 경로로 함께 겨눈다.
final class AuthorizedSessionTests: XCTestCase {

    private let meBody = #"{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"#
    private let unauthorized = #"{"code":"AUTH_TOKEN_INVALID","message":"x","retryable":false,"correlationId":"c"}"#

    /// 갱신 응답. 테스트마다 바꿔 끼운다.
    private var refreshResponse: (status: Int, body: String) = (200, #"{"accessToken":"jwt_new","refreshToken":"rt_new","accessTokenExpiresInSec":900}"#)
    private let counts = Counts()

    override func setUp() {
        super.setUp()
        MockURLProtocol.reset()
        // 서버 흉내: jwt_new만 받아 주고, 옛 토큰은 401이다. 갱신은 호출 수를 센다.
        MockURLProtocol.setHandler { [unowned self] request in
            let path = request.url?.path ?? ""
            let (status, body): (Int, String)
            switch path {
            case "/v0/auth/refresh":
                counts.bump("refresh")
                // 동시 401이 전부 갱신 줄에 서도록 조금 늦게 답한다.
                Thread.sleep(forTimeInterval: 0.1)
                (status, body) = refreshResponse
            case "/v0/users/me":
                counts.bump("me")
                (status, body) = request.value(forHTTPHeaderField: "Authorization") == "Bearer jwt_new"
                    ? (200, meBody) : (401, unauthorized)
            default:
                (status, body) = (404, "")
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
            return (response, Data(body.utf8))
        }
    }

    override func tearDown() {
        MockURLProtocol.reset()
        super.tearDown()
    }

    private func clients(_ store: TokenStore) -> AuthClients {
        AuthClients(baseURL: "https://api.test/", store: store, session: MockURLProtocol.makeSession())
    }

    func test401이면_갱신하고_새_Bearer로_원래_요청을_다시_보내_성공한다() async throws {
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))

        let result = await clients(store).api.me()

        guard case .success = result else { return XCTFail("\(result)") }
        XCTAssertEqual(1, counts.refresh)
        // 회전된 쌍을 통째로 저장했다.
        XCTAssertEqual(AuthTokens("jwt_new", "rt_new"), store.tokens)
        // 첫 요청(옛 토큰) + 재시도(새 토큰)
        XCTAssertEqual(2, counts.me)
        let refresh = try XCTUnwrap(MockURLProtocol.requests().first { $0.url?.path == "/v0/auth/refresh" })
        XCTAssertEqual(#"{"refreshToken":"rt_old"}"#, String(data: refresh.body, encoding: .utf8))
        XCTAssertNil(refresh.header("Authorization"))
    }

    func test갱신한_쌍의_저장이_실패해도_새_Bearer로_다시_보내_성공하고_메모리에는_새_쌍이_남는다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        store.persists = false

        let result = await clients(store).api.me()

        guard case .success = result else { return XCTFail("\(result)") }
        XCTAssertEqual(1, counts.refresh)
        XCTAssertEqual(2, counts.me)
        let cached = await store.read()
        XCTAssertEqual(AuthTokens("jwt_new", "rt_new"), cached)
    }

    func test동시에_5개가_401을_받아도_갱신은_한_번만_나간다() async {
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        let api = clients(store).api

        let results = await withTaskGroup(of: AuthResult<Account>.self) { group in
            for _ in 0..<5 { group.addTask { await api.me() } }
            return await group.reduce(into: []) { $0.append($1) }
        }

        XCTAssertEqual(5, results.filter { if case .success = $0 { return true } else { return false } }.count, "\(results)")
        XCTAssertEqual(1, counts.refresh)
        XCTAssertEqual(AuthTokens("jwt_new", "rt_new"), store.tokens)
    }

    func test갱신이_401이면_저장소를_비우고_로그아웃_신호를_내며_재시도_고리를_돌지_않는다() async {
        refreshResponse = (401, #"{"code":"AUTH_REFRESH_REUSED","message":"x","retryable":false,"correlationId":"c"}"#)
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        let clients = clients(store)
        let signedOut = Counts()
        await clients.refresher.setOnSignedOut { signedOut.bump("me") }

        let result = await clients.api.me()

        guard case .rejected(let status, _, _, _, _) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(401, status)
        XCTAssertNil(store.tokens)
        XCTAssertEqual(1, signedOut.me)
        XCTAssertEqual(1, counts.refresh)
        XCTAssertEqual(1, counts.me)
    }

    func test갱신이_503이면_토큰을_지우지_않고_이번_요청만_실패한다() async {
        refreshResponse = (503, #"{"code":"AUTH_STORE_UNAVAILABLE","message":"x","retryable":true,"correlationId":"c"}"#)
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        let clients = clients(store)
        let signedOut = Counts()
        await clients.refresher.setOnSignedOut { signedOut.bump("me") }

        let result = await clients.api.me()

        guard case .rejected(let status, _, _, _, _) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(401, status)
        XCTAssertEqual(AuthTokens("jwt_old", "rt_old"), store.tokens)
        XCTAssertEqual(0, signedOut.me)
    }

    func test새_토큰으로_다시_보낸_요청도_401이면_한_번에서_멈춘다() async {
        // 갱신은 되지만 서버가 새 토큰도 받지 않는 경우 (계정 삭제 등).
        refreshResponse = (200, #"{"accessToken":"jwt_other","refreshToken":"rt_other","accessTokenExpiresInSec":900}"#)
        let store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))

        let result = await clients(store).api.me()

        guard case .rejected(let status, _, _, _, _) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(401, status)
        XCTAssertEqual(1, counts.refresh)
        XCTAssertEqual(2, counts.me)
    }

    func test토큰이_없으면_Bearer_없이_나가고_401이어도_갱신하지_않는다() async {
        let result = await clients(InMemoryTokenStore()).api.me()

        guard case .rejected = result else { return XCTFail("\(result)") }
        XCTAssertNil(MockURLProtocol.lastRequest()?.header("Authorization"))
        XCTAssertEqual(0, counts.refresh)
    }

    /// 세션 생성도 같은 관문을 탄다 (KAN-224) — Bearer를 싣고, 재응시 토큰은 헤더가 아니라 본문으로 간다.
    func test세션_생성은_Access_토큰을_싣고_이전_세션_토큰은_본문으로_보낸다() async throws {
        MockURLProtocol.respond(
            status: 201,
            body: #"{"sessionId":"s_1","sessionToken":"st_1","testVersion":"t","voiceSet":1,"scoreVersion":"sv","expiresAt":"x"}"#
        )
        let client = clients(InMemoryTokenStore(AuthTokens("jwt_a", "rt_a"))).sessionClient(session: MockURLProtocol.makeSession())

        _ = await client.create(appVersion: "1.0", previousToken: "st_old")

        let recorded = try XCTUnwrap(MockURLProtocol.lastRequest())
        XCTAssertEqual("Bearer jwt_a", recorded.header("Authorization"))
        let body = try XCTUnwrap(String(data: recorded.body, encoding: .utf8))
        XCTAssertTrue(body.contains(#""previousSessionToken":"st_old""#), body)
    }
}

/// URLProtocol 스레드에서 세는 호출 수.
private final class Counts: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: Int] = [:]
    var refresh: Int { count("refresh") }
    var me: Int { count("me") }

    func bump(_ name: String) {
        lock.lock()
        values[name, default: 0] += 1
        lock.unlock()
    }

    private func count(_ name: String) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return values[name] ?? 0
    }
}
