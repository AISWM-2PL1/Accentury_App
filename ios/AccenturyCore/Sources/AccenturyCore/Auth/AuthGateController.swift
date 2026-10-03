import Combine
import Foundation

/// 봉투를 읽을 수 있을 때의 요청 제한 코드 (§2.5).
private let codeRateLimited = "RATE_LIMITED"

/// 만 14세 미만 가입 거절 (§3.10).
private let codeUnderAge = "AUTH_UNDER_AGE"

private let statusUnauthorized = 401

/// 앱 진입 게이트의 로그인 관문 상태 (KAN-224). 세션 게이트(KAN-34)보다 앞에 선다.
public enum AuthGateState: Equatable, Sendable {

    /// 저장된 토큰이 아직 살아 있는지 확인 중이다. 화면은 런치 화면과 같은 얼굴을 유지한다.
    case checking

    /// 로그인 화면. 값은 방금 실패한 로그인 시도의 안내다 (처음 들어왔으면 nil).
    /// 사용자가 IdP 화면에서 취소한 경우는 여기로 오지 않는다 — 호출자가 ``AuthGateController/login(_:privacyPolicyVersion:)``을 부르지 않는다.
    case signedOut(AuthFailure?)

    /// 로그인은 됐지만 추가 정보(§3.10)가 없다. `error`는 방금 실패한 제출의 안내다.
    case needsProfile(AuthUser, error: AuthFailure?)

    /// 테스트에 들어갈 수 있다.
    case signedIn(AuthUser)

    /// 시작 확인이 판정 없이 끝났다 (전송 실패·429·5xx). **토큰은 그대로다** — 여기서 로그인 화면으로 보내면
    /// 망이 잠깐 끊긴 사용자를 로그아웃시키는 셈이다. 화면은 [다시 시도]로 ``AuthGateController/bootstrap()``을 다시 부른다.
    case checkFailed(AuthFailure)
}

/// 실패 안내의 갈래. ``SessionFailureReason``과 같은 이유로 상태 코드 대신 "사용자가 무엇을 할 수 있나"로 접는다.
public enum AuthFailureReason: Sendable {
    /// 곧바로 다시 해 보면 된다 — 전송 실패, IdP 토큰 거절(401 `AUTH_IDP_TOKEN_INVALID`: SDK 토큰이 막 만료된 경우 등).
    case retry

    /// 서버나 IdP 쪽이 잠시 안 된다 (502 `AUTH_IDP_UNAVAILABLE`, 503 `AUTH_STORE_UNAVAILABLE` 등 재시도 가능한 거절).
    case retryLater

    /// 429 — 요청이 몰렸다 (§2.5). ``AuthFailure/retryAfterSeconds``만큼 기다리면 풀린다.
    case rateLimited

    /// 만 14세 미만 (400 `AUTH_UNDER_AGE`). 추가 정보 화면에서만 나온다.
    case underAge

    /// 서버가 재시도 불가로 못박았다 (`VALIDATION_FAILED`·`AUTH_CONSENT_REQUIRED`) — 앱과 서버 계약이 어긋난 경우다.
    case unsupported
}

/// - `retryAfterSeconds`: ``AuthFailureReason/rateLimited``일 때 서버가 알려준 대기 시간(초). 그 외에는 nil
public struct AuthFailure: Equatable, Sendable {
    public let reason: AuthFailureReason
    public let retryAfterSeconds: Int64?

    public init(_ reason: AuthFailureReason, retryAfterSeconds: Int64? = nil) {
        self.reason = reason
        self.retryAfterSeconds = retryAfterSeconds
    }
}

/// 로그인 상태 머신 (KAN-224). 안드로이드 `auth/AuthGateController.kt`의 이식본이다.
///
/// 화면에서 분리한 이유는 ``SessionGateController``와 같다 — 오류 응답을 어느 복구 경로로 접는지가 진입 UX를
/// 좌우하는데, SwiftUI에 붙어 있으면 시뮬레이터 없이 검증할 수 없다. 상태는 `@Published`라 화면이 그대로 따라온다
/// (안드로이드 `StateFlow` 자리). 화면이 메인에서만 읽고 쓰므로 `@MainActor`다.
///
/// 저장소의 주인은 여전히 ``TokenRefresher``·``AuthApi``의 호출 흐름이고, 이 클래스는 저장소를 **보는** 쪽이다.
/// 예외는 로그인 성공(쌍을 처음 저장)과 로그아웃(무조건 비움) 둘뿐이다.
@MainActor
public final class AuthGateController: ObservableObject {

    @Published public private(set) var state: AuthGateState = .checking

    private let api: AuthApi
    private let store: TokenStore
    private let refresher: TokenRefresher

    public init(api: AuthApi, store: TokenStore, refresher: TokenRefresher) {
        self.api = api
        self.store = store
        self.refresher = refresher
    }

    /// 어떤 요청에서든 Refresh가 거절되면 저장소는 이미 비었다 — 화면도 로그인으로 돌린다.
    ///
    /// 안드로이드는 생성자에서 등록하지만 액터에 거는 등록은 await가 필요해 생성자에 둘 수 없다. 그래서 관문이
    /// 처음 서버에 닿는 두 자리(``bootstrap()``·``login(_:privacyPolicyVersion:)``) 앞에서 건다 — 그 전에는
    /// 저장소에 토큰이 없거나 아직 한 번도 쓰이지 않았다. 여러 번 걸어도 같은 콜백으로 덮을 뿐이다.
    private func registerSignedOutHook() async {
        // 강하게 잡는다 — 관문과 갱신기는 앱 수명 내내 한 쌍으로 산다(앱 타깃 `AuthHub`). 약하게 잡으려면 옵셔널
        // self를 동시 실행 클로저로 넘겨야 하는데 Swift 6 격리 검사가 그 캡처를 막는다.
        await refresher.setOnSignedOut { [self] in await markSignedOutByRefresh() }
    }

    private func markSignedOutByRefresh() {
        state = .signedOut(nil)
    }

    /// 앱 시작 시 한 번(그리고 ``AuthGateState/checkFailed(_:)``의 [다시 시도]마다) 부른다.
    ///
    /// 저장된 Access로 곧장 `me()`를 부르지 않고 갱신부터 하는 이유: Refresh가 살아 있는지가 "로그인 상태"의
    /// 정본이다. 오래 안 연 앱의 Access는 거의 늘 만료돼 있어 어차피 갱신을 한 번 거치고, 여기서 먼저 해 두면
    /// 거절(401)을 로그인 화면으로, 판정 없음(망·5xx)을 [다시 시도]로 깔끔히 가를 수 있다.
    public func bootstrap() async {
        await registerSignedOutHook()
        state = .checking
        guard await store.read() != nil else {
            state = .signedOut(nil)
            return
        }
        switch await refresher.refresh(staleAccess: nil) {
        case .signedOut:
            state = .signedOut(nil)
        case .failed(let result):
            state = .checkFailed(Self.failure(of: result))
        case .refreshed:
            let me = await api.me()
            if case .success(let account) = me {
                state = Self.state(of: account)
            } else if await store.read() == nil {
                state = .signedOut(nil)
            } else {
                state = .checkFailed(Self.failure(of: me))
            }
        }
    }

    /// IdP SDK가 준 자격으로 로그인한다. 사용자가 SDK 화면에서 취소했으면 부르지 않는다(안내할 오류가 아니다).
    /// 진행 중 버튼 비활성은 화면이 이 호출이 도는 동안 건다 (``LoginScreenState``).
    public func login(_ credential: LoginCredential, privacyPolicyVersion: String) async {
        await registerSignedOutHook()
        let result = await api.login(credential, privacyPolicyVersion: privacyPolicyVersion)
        if case .success(let success) = result {
            guard await store.save(success.tokens) else {
                // 저장되지 않은 첫 로그인은 지금은 들어간 것처럼 보이다가 다음 실행 때 조용히 로그아웃된다(자동 로그인 AC 위반).
                // 메모리에 남은 쌍까지 비우고 실패로 알려 사용자가 다시 시도하게 한다.
                await store.clear()
                state = .signedOut(AuthFailure(.retry))
                return
            }
            state = Self.state(of: success.account)
        } else {
            state = .signedOut(Self.failure(of: result))
        }
    }

    /// 추가 정보를 제출한다. ``AuthGateState/needsProfile(_:error:)``가 아니면 무시한다.
    public func submitProfile(_ input: ProfileInput) async {
        guard case .needsProfile(let user, _) = state else { return }
        let result = await api.updateProfile(input)
        if case .success(let account) = result {
            state = Self.state(of: account)
            return
        }
        // 갱신 거절로 저장소가 비었으면 로그아웃 콜백이 이미 로그인 화면으로 돌렸다 — 덮어쓰지 않는다.
        guard await store.read() != nil else { return }
        state = .needsProfile(user, error: Self.failure(of: result))
    }

    /// 세션 생성이 403 `AUTH_PROFILE_INCOMPLETE`로 막혔을 때 부른다. 서버가 프로필을 미완료로 본다면(다른 기기에서
    /// 값이 지워지는 등) 앱이 들고 있던 ``AuthGateState/signedIn(_:)``이 낡은 것이다 — 추가 정보 화면으로 돌린다.
    public func onProfileIncomplete() {
        guard case .signedIn(let user) = state else { return }
        state = .needsProfile(user, error: nil)
    }

    /// 로그아웃. 서버 폐기가 실패해도(망·5xx) **로컬 토큰은 반드시 지운다** — 사용자가 로그아웃을 눌렀는데
    /// 로그인 상태가 남으면 그것이 더 큰 문제다. 서버에 남은 Refresh는 만료로 사라진다.
    ///
    /// 부르는 곳은 추가 정보 화면의 [다른 계정으로 로그인]과 설정 화면의 [로그아웃](KAN-247) 둘이다.
    ///
    /// - Parameter idpLogout: IdP SDK 쪽 로그아웃 (앱 타깃 `IdpLogout.all`). 서버 로그아웃 뒤에 부른다
    public func logout(idpLogout: @MainActor () async -> Void = {}) async {
        if let tokens = await store.read() {
            _ = await api.logout(tokens.refreshToken)
        }
        await idpLogout()
        await store.clear()
        state = .signedOut(nil)
    }

    private static func state(of account: Account) -> AuthGateState {
        switch account.profileStatus {
        case .COMPLETE: return .signedIn(account.user)
        case .INCOMPLETE: return .needsProfile(account.user, error: nil)
        }
    }

    /// 안드로이드 `failureOf`. 성공을 넘기면 안 된다 — 호출부가 전부 성공을 먼저 걸렀다.
    static func failure<T>(of result: AuthResult<T>) -> AuthFailure {
        switch result {
        case .success:
            preconditionFailure("성공은 실패 안내가 아니다")
        case .transportError:
            return AuthFailure(.retry)
        case .rejected(let status, let code, _, let retryable, let retryAfterMs):
            // 봉투를 읽었으면 코드가 정본이고, 못 읽었으면 대기 시간의 존재가 대신 말해 준다 (SessionGateController와 같은 판정).
            if code == codeRateLimited || retryAfterMs != nil {
                return AuthFailure(.rateLimited, retryAfterSeconds: retryAfterMs.map(ceilSeconds))
            }
            if code == codeUnderAge { return AuthFailure(.underAge) }
            // 로그인의 401은 IdP 토큰 거절이다 — SDK에서 새 토큰을 받아 다시 하면 된다.
            if status == statusUnauthorized { return AuthFailure(.retry) }
            return AuthFailure(retryable ? .retryLater : .unsupported)
        }
    }
}
