import Foundation

// 서버 계약(KAN-223, API 명세서 §3.9~§3.13)에 묶인 값들. 계약이 바뀌면 여기만 고친다.
private let pathLogin = "v0/auth/login"
private let pathRefresh = "v0/auth/refresh"
private let pathLogout = "v0/auth/logout"
private let pathMe = "v0/users/me"
private let pathProfile = "v0/users/me/profile"
private let jsonMediaType = "application/json"
private let headerContentType = "Content-Type"
private let headerCorrelationId = "X-Correlation-Id"
private let headerRetryAfter = "Retry-After"

/// 요청 한 건을 내보내는 자리 (KAN-224). `URLSession.data(for:)`와 같은 모양이다.
///
/// 클라이언트가 `URLSession`을 직접 들지 않고 이 함수를 받는 이유: 같은 요청을 "토큰 없이"(로그인·갱신)와
/// "Bearer + 401 갱신"(``AuthorizedSession``)으로 내보내야 하는데, 안드로이드는 그 차이를 OkHttpClient
/// 두 벌이 들고 있었다. URLSession에는 인터셉터가 없어 감싸는 함수로 같은 일을 한다.
public typealias HTTPSend = @Sendable (URLRequest) async throws -> (Data, URLResponse)

public extension URLSession {
    /// 이 세션을 그대로 쓰는 ``HTTPSend``.
    var send: HTTPSend { { [self] request in try await self.data(for: request) } }
}

/// 인증 API 한 번의 결과. 판정(무엇을 보여줄지)은 ``AuthGateController``가 한다 — ``SessionResult``와 같은 모양이다.
public enum AuthResult<Value: Sendable>: Sendable {

    case success(Value)

    /// 서버가 응답은 했지만 원하는 값을 주지 않았다. `status` 외 필드는 공통 오류 봉투(§2.4) 그대로다.
    ///
    /// `status`를 드는 이유: 세션 생성과 달리 여기서는 401이 "다시 로그인"이라는 별도 복구 경로다.
    /// 봉투를 못 읽는 401(프록시가 끼어든 경우 등)도 같은 경로로 보내려면 코드가 아니라 상태로 봐야 한다.
    case rejected(status: Int, code: String?, message: String?, retryable: Bool, retryAfterMs: Int64?)

    /// 응답이 아예 오지 않은 전송 실패. 의미상 항상 재시도 가능.
    case transportError(reason: String)
}

extension AuthResult: Equatable where Value: Equatable {}

/// 로그인 제공자 (§3.9). GOOGLE·APPLE은 ID 토큰을, KAKAO·NAVER는 IdP Access 토큰을 보낸다.
public enum Provider: String, Codable, Sendable, CaseIterable {
    case GOOGLE, KAKAO, NAVER, APPLE
}

public enum ProfileStatus: String, Codable, Sendable {
    case COMPLETE, INCOMPLETE
}

/// IdP SDK가 준 로그인 자격 한 건 (KAN-224).
///
/// 로컬 개발에서는 서버의 가짜 IdP가 `fake:<sub>`를 토큰으로 받는다 — SDK 없이 게이트를 돌려볼 수 있다.
///
/// - `idToken`: GOOGLE·APPLE
/// - `accessToken`: KAKAO·NAVER의 IdP Access 토큰 (우리 서버 토큰이 아니다)
/// - `nonce`: APPLE 필수 — **원문**이다. 애플 요청에는 SHA-256을 실었고 서버가 ID 토큰의 nonce와 대조한다
/// - `name`: APPLE이 최초 로그인에만 주는 이름. 다른 제공자는 nil
public struct LoginCredential: Equatable, Sendable, CustomStringConvertible {
    public let provider: Provider
    public let idToken: String?
    public let accessToken: String?
    public let nonce: String?
    public let name: String?

    public init(provider: Provider, idToken: String? = nil, accessToken: String? = nil, nonce: String? = nil, name: String? = nil) {
        self.provider = provider
        self.idToken = idToken
        self.accessToken = accessToken
        self.nonce = nonce
        self.name = name
    }

    public var description: String { "LoginCredential[provider=\(provider.rawValue)]" }
}

/// 서버의 UserView (§3.11). 이메일·이름·생년월일·성별·지역은 계정 개인 정보다.
///
/// - `region`: 출신지역 코드 10개 중 하나 (서버 Region 열거형 이름). 미입력이면 nil
public struct AuthUser: Codable, Equatable, Sendable, CustomStringConvertible {
    public let id: String
    public let provider: Provider
    public var email: String?
    public var name: String?
    public var birthDate: String?
    public var gender: String?
    public var region: String?
    public var nickname: String?
    public var profileImageUrl: String?

    public init(
        id: String,
        provider: Provider,
        email: String? = nil,
        name: String? = nil,
        birthDate: String? = nil,
        gender: String? = nil,
        region: String? = nil,
        nickname: String? = nil,
        profileImageUrl: String? = nil
    ) {
        self.id = id
        self.provider = provider
        self.email = email
        self.name = name
        self.birthDate = birthDate
        self.gender = gender
        self.region = region
        self.nickname = nickname
        self.profileImageUrl = profileImageUrl
    }

    // id만 찍는다 — 나머지는 개인 정보다 (서버 UserView.toString과 같은 규칙).
    public var description: String { "AuthUser[id=\(id)]" }
}

/// `GET /v0/users/me`·`PUT /v0/users/me/profile`의 응답 (§3.10·§3.11).
public struct Account: Codable, Equatable, Sendable {
    public let profileStatus: ProfileStatus
    public let user: AuthUser

    public init(profileStatus: ProfileStatus, user: AuthUser) {
        self.profileStatus = profileStatus
        self.user = user
    }
}

/// 로그인 성공 (§3.9). `isNewUser`는 가입 계측용으로만 쓴다 — 화면 분기는 `account`의 profileStatus가 정한다.
public struct LoginSuccess: Equatable, Sendable {
    public let tokens: AuthTokens
    public let isNewUser: Bool
    public let account: Account
}

/// 추가 정보 입력값 (§3.10).
///
/// - `birthDate`: `YYYY-MM-DD`. 만 14세 미만은 400 `AUTH_UNDER_AGE`
/// - `gender`: `MALE` | `FEMALE`
/// - `region`: 출신지역 코드 10개 중 하나 (``Region``)
public struct ProfileInput: Codable, Equatable, Sendable, CustomStringConvertible {
    public let email: String
    public let name: String
    public let birthDate: String
    public let gender: String
    public let region: String

    public init(email: String, name: String, birthDate: String, gender: String, region: String) {
        self.email = email
        self.name = name
        self.birthDate = birthDate
        self.gender = gender
        self.region = region
    }

    public var description: String { "ProfileInput[]" }
}

/// 인증 API 클라이언트 (KAN-224, 서버 KAN-223). 안드로이드 `auth/AuthApi.kt`의 이식본이다.
///
/// 보내는 자리를 둘 받는 이유: 로그인·갱신은 토큰 **없이** 나가야 하고, 내 정보·프로필·로그아웃은 Access
/// 토큰을 싣고 401이면 갱신해 다시 나가야 한다. 갱신 호출이 Bearer·자동 갱신을 타면 갱신 실패가 다시 갱신을
/// 부르는 고리가 생긴다. `authedSend`를 만드는 곳은 ``AuthClients``다.
public struct AuthApi: Sendable {

    private let baseURL: URL
    /// 토큰 없는 호출용 (login·refresh)
    private let send: HTTPSend
    /// Bearer + 자동 갱신 호출용 (me·updateProfile·logout)
    private let authedSend: HTTPSend

    public init(baseURL: String, send: @escaping HTTPSend, authedSend: @escaping HTTPSend) {
        guard let url = URL(string: baseURL) else {
            preconditionFailure("인증 baseUrl을 URL로 읽지 못했다: \(baseURL)")
        }
        self.baseURL = url
        self.send = send
        self.authedSend = authedSend
    }

    /// 소셜 로그인 = 가입 겸용 (§3.9).
    ///
    /// - Parameter privacyPolicyVersion: 사용자가 동의한 개인정보처리방침 버전 (`[A-Za-z0-9._-]{1,32}`).
    ///   동의는 로그인 화면이 받으므로 이 호출은 늘 `privacyConsent: true`로 나간다 — 동의 없이 로그인
    ///   버튼이 눌릴 수 없다는 것이 화면의 전제다. 기존 계정 재로그인에서는 서버가 두 값을 보지 않는다.
    public func login(_ credential: LoginCredential, privacyPolicyVersion: String) async -> AuthResult<LoginSuccess> {
        let body = LoginBody(
            provider: credential.provider,
            idToken: credential.idToken,
            accessToken: credential.accessToken,
            nonce: credential.nonce,
            user: credential.name.map(LoginUserBody.init),
            privacyConsent: true,
            privacyPolicyVersion: privacyPolicyVersion
        )
        return await call(send, request(pathLogin, method: "POST", body: body)) { data in
            let decoded = try JSONDecoder().decode(LoginResponseBody.self, from: data)
            return LoginSuccess(
                tokens: AuthTokens(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken),
                isNewUser: decoded.isNewUser,
                account: Account(profileStatus: decoded.profileStatus, user: decoded.user)
            )
        }
    }

    /// Refresh 회전 (§3.12). 성공하면 받은 쌍을 반드시 통째로 저장해야 한다 — 보낸 Refresh는 이미 죽었다.
    public func refresh(_ refreshToken: String) async -> AuthResult<AuthTokens> {
        await call(send, request(pathRefresh, method: "POST", body: RefreshBody(refreshToken: refreshToken))) { data in
            let decoded = try JSONDecoder().decode(TokenResponseBody.self, from: data)
            return AuthTokens(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken)
        }
    }

    /// 내 계정과 프로필 완료 여부 (§3.11).
    public func me() async -> AuthResult<Account> {
        await call(authedSend, request(pathMe, method: "GET", body: Optional<RefreshBody>.none), decode: Self.decodeAccount)
    }

    /// 추가 정보 입력 = 프로필 완료 (§3.10). 이미 완료된 프로필에 다시 부르면 값을 갱신한다.
    public func updateProfile(_ input: ProfileInput) async -> AuthResult<Account> {
        await call(authedSend, request(pathProfile, method: "PUT", body: input), decode: Self.decodeAccount)
    }

    /// 로그아웃 (§3.13) — 그 Refresh의 패밀리를 서버에서 폐기한다. 모르는 토큰도 204다.
    public func logout(_ refreshToken: String) async -> AuthResult<Void> {
        await call(authedSend, request(pathLogout, method: "POST", body: RefreshBody(refreshToken: refreshToken))) { _ in () }
    }

    private static func decodeAccount(_ data: Data) throws -> Account {
        try JSONDecoder().decode(Account.self, from: data)
    }

    private func request<Body: Encodable>(_ path: String, method: String, body: Body?) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue(UUID().uuidString, forHTTPHeaderField: headerCorrelationId)
        if let body {
            // 합성된 Encodable이 옵셔널을 encodeIfPresent로 내보내 nil 필드는 키째 빠진다 — 서버 검증이
            // `null`로 온 값과 없는 값을 다르게 볼 수 있다 (안드로이드 encodeDefaults=false와 같은 결과).
            request.httpBody = try? JSONEncoder().encode(body)
            request.setValue(jsonMediaType, forHTTPHeaderField: headerContentType)
        }
        return request
    }

    private func call<T: Sendable>(
        _ send: HTTPSend,
        _ request: URLRequest,
        decode: (Data) throws -> T
    ) async -> AuthResult<T> {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await send(request)
        } catch {
            return .transportError(reason: (error as? URLError)?.localizedDescription ?? "\(error)")
        }
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        if (200...299).contains(status) {
            // 성공 본문을 못 읽으면 세션 생성과 같은 규칙으로 재시도 가능한 거절이다. 본문은 토큰을 담고
            // 있을 수 있어 메시지에 싣지 않는다.
            guard let value = try? decode(data) else {
                return .rejected(status: status, code: nil, message: "성공 응답(\(status)) 본문을 읽지 못함", retryable: true, retryAfterMs: nil)
            }
            return .success(value)
        }
        let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
        return .rejected(
            status: status,
            code: envelope?.code,
            message: envelope?.message ?? "오류 봉투 없는 응답(\(status))",
            retryable: envelope?.retryable ?? URLSessionSessionClient.isRetryableStatus(status),
            retryAfterMs: envelope?.retryAfterMs
                ?? http?.value(forHTTPHeaderField: headerRetryAfter).flatMap(Int64.init).map { $0 * 1_000 }
        )
    }
}

/* 요청·응답 DTO. 토큰이나 개인 정보를 드는 것은 전부 설명을 가린다 — 로그·크래시에 실리면 안 된다. */

private struct LoginUserBody: Encodable, CustomStringConvertible {
    let name: String
    var description: String { "LoginUserBody[]" }
}

private struct LoginBody: Encodable, CustomStringConvertible {
    let provider: Provider
    let idToken: String?
    let accessToken: String?
    let nonce: String?
    let user: LoginUserBody?
    let privacyConsent: Bool
    let privacyPolicyVersion: String
    var description: String { "LoginBody[provider=\(provider.rawValue)]" }
}

private struct RefreshBody: Encodable, CustomStringConvertible {
    let refreshToken: String
    var description: String { "RefreshBody[]" }
}

private struct TokenResponseBody: Decodable, CustomStringConvertible {
    let accessToken: String
    let refreshToken: String
    var description: String { "TokenResponseBody[]" }
}

private struct LoginResponseBody: Decodable, CustomStringConvertible {
    let accessToken: String
    let refreshToken: String
    let isNewUser: Bool
    let profileStatus: ProfileStatus
    let user: AuthUser
    var description: String { "LoginResponseBody[user=\(user)]" }
}
