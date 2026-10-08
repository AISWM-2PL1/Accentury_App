import Foundation

private let headerAuthorization = "Authorization"
private let bearerPrefix = "Bearer "
private let statusUnauthorized = 401

/// Bearer를 싣고, 401이면 한 번 갱신해 한 번 다시 보내는 전송 (KAN-224).
/// 안드로이드 `AccessTokenInterceptor` + `TokenAuthenticator`(auth/AuthHttp.kt) 한 쌍의 자리다 —
/// URLSession에는 인터셉터·Authenticator 확장점이 없어 요청 함수를 감싼다.
///
/// - 토큰이 없으면(로그아웃 상태) 헤더 없이 보낸다 — 세션 생성은 익명으로도 성립하는 호출이라 여기서 막을
///   이유가 없다. 호출자가 이미 Authorization을 달았으면 건드리지 않는다.
/// - 다시 보낸 요청마저 401이면 포기한다. 새 토큰도 거절당했다면 갱신으로 풀리는 문제가 아니고(계정 삭제 등),
///   계속 돌면 갱신-거절 무한 고리다. Bearer 없이 나간 요청의 401도 손대지 않는다: 갱신할 토큰이 애초에 없다.
/// - 갱신이 거절됐거나(저장소는 이미 비었다) 판정이 안 났으면(토큰은 그대로) 첫 401을 호출자에게 그대로 올린다.
///
/// **사용자 API(`/v0/users/me*`, `/v0/auth/logout`)와 세션 생성(`POST /v0/sessions`)에만 쓴다.** 세션 범위
/// API(업로드 등)는 `st_` 세션 토큰을 `Authorization`에 싣는 기존 전송 그대로다 — 여기를 타면 세션 토큰 자리를 덮는다.
public struct AuthorizedSession: Sendable {

    private let transport: HTTPSend
    private let store: TokenStore
    private let refresher: TokenRefresher

    /// - Parameter send: 실제로 내보내는 자리. 세션 생성은 15초 상한 세션을 준다(``defaultSessionCreateSession()``)
    public init(send: @escaping HTTPSend, store: TokenStore, refresher: TokenRefresher) {
        self.transport = send
        self.store = store
        self.refresher = refresher
    }

    public func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        var request = request
        var sentAccess: String?
        if request.value(forHTTPHeaderField: headerAuthorization) == nil, let access = await store.read()?.accessToken {
            request.setValue(bearerPrefix + access, forHTTPHeaderField: headerAuthorization)
            sentAccess = access
        }
        let first = try await transport(request)
        // 취소된 요청(탈퇴 상한 초과 — KAN-251 리뷰 P0)은 늦은 401로 갱신을 시작하지 않는다. 갱신 거절이면 저장소를
        // 비우고 로그인 화면으로 돌려, 호출자가 이미 내린 판정(실패·로그인 유지)을 뒤집는다.
        guard (first.1 as? HTTPURLResponse)?.statusCode == statusUnauthorized, let sentAccess, !Task.isCancelled else { return first }
        guard case .refreshed(let tokens) = await refresher.refresh(staleAccess: sentAccess) else { return first }
        request.setValue(bearerPrefix + tokens.accessToken, forHTTPHeaderField: headerAuthorization)
        return try await transport(request)
    }

    /// ``HTTPSend``로 넘길 모양.
    public var send: HTTPSend { { [self] request in try await self.data(for: request) } }
}

/// 인증 쪽 객체들을 한 번에 엮는다 (KAN-224). 앱에서 하나만 만든다 — 둘이면 Refresh 회전을 줄 세우는
/// 관문이 둘이 되어 동시 갱신이 서로의 Refresh를 죽인다. 안드로이드 `AuthClients`의 이식본이다.
///
/// 생성 순서의 고리: 인증 전송은 ``refresher``를 알아야 하고, ``refresher``는 갱신 호출을, 갱신 호출은
/// 토큰 없는 전송만 알면 된다. 그래서 갱신용 ``AuthApi``는 토큰 없는 전송 둘로 따로 만든다(갱신은 그쪽만 쓴다).
public final class AuthClients: Sendable {

    public let store: TokenStore
    public let refresher: TokenRefresher
    /// Bearer + 자동 갱신 전송. 사용자 API가 쓴다.
    public let authorized: AuthorizedSession
    public let api: AuthApi
    private let baseURL: String

    /// - Parameter session: 로그인·갱신이 그대로 나가는 바탕 세션
    public init(baseURL: String, store: TokenStore, session: URLSession = .shared) {
        let plain = session.send
        let refreshApi = AuthApi(baseURL: baseURL, send: plain, authedSend: plain)
        let refresher = TokenRefresher(store: store) { refreshToken in await refreshApi.refresh(refreshToken) }
        let authorized = AuthorizedSession(send: plain, store: store, refresher: refresher)
        self.baseURL = baseURL
        self.store = store
        self.refresher = refresher
        self.authorized = authorized
        self.api = AuthApi(baseURL: baseURL, send: plain, authedSend: authorized.send)
    }

    /// 세션 생성 클라이언트 (KAN-224). 계정 Access 토큰을 실어 서버가 세션을 계정에 묶고 출신지역을 계정 값으로
    /// 채운다. 안드로이드 `OkHttpSessionClient(API_BASE_URL, sessionCreationClient(authedClient))` 자리다 —
    /// 15초 상한 세션 위에 같은 저장소·같은 갱신 관문을 얹는다.
    public func sessionClient(session: URLSession = defaultSessionCreateSession()) -> URLSessionSessionClient {
        URLSessionSessionClient(
            baseURL: baseURL,
            send: AuthorizedSession(send: session.send, store: store, refresher: refresher).send
        )
    }
}
