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
    ///
    /// `voiceConsent`는 계정의 음성 저장 선택 동의다 (KAN-270). nil = 모른다 — 로그인 직후 `me()`가 실패했거나
    /// 옛 서버다. 모르는 상태에는 동의 화면을 띄우지 않고(``shouldPromptVoiceConsent(state:wasPrompted:)``), 설정
    /// 화면이 다시 읽게 한다.
    case signedIn(AuthUser, voiceConsent: VoiceConsent?)

    /// 시작 확인이 판정 없이 끝났다 (전송 실패·429·5xx). **토큰은 그대로다** — 여기서 로그인 화면으로 보내면
    /// 망이 잠깐 끊긴 사용자를 로그아웃시키는 셈이다. 화면은 [다시 시도]로 ``AuthGateController/bootstrap()``을 다시 부른다.
    case checkFailed(AuthFailure)
}

/// 회원 탈퇴 한 번의 결말 (KAN-251). 안드로이드 `WithdrawOutcome`과 같다.
public enum WithdrawOutcome: Equatable, Sendable {

    /// 서버가 계정을 파기했다. 토큰·IdP 세션도 정리됐고 게이트는 ``AuthGateState/signedOut(_:)``이다.
    case withdrawn

    /// 탈퇴되지 않았다(전송 실패·시간 초과·5xx·429 등). 토큰과 상태는 그대로다 — 로그인 상태가 유지된다.
    case failed(AuthFailure)
}

/// 탈퇴 직전 애플 재인증의 결말 (KAN-251). 앱 타깃 `AppleIdp.reauthorize()`가 만든다.
public enum AppleReauth: Equatable, Sendable, CustomStringConvertible {

    /// 재인증이 돌려준 `authorizationCode`(UTF-8). 서버가 애플 토큰으로 바꿔 revoke한다 — 로그에 남기지 않는다.
    case code(String)

    /// 사용자가 애플 창에서 취소했다 — 탈퇴하지 않겠다는 뜻이다.
    case cancelled

    /// 그 밖의 실패(코드 없음 포함).
    case failed

    public var description: String {
        switch self {
        case .code: return "AppleReauth.code[]"
        case .cancelled: return "AppleReauth.cancelled"
        case .failed: return "AppleReauth.failed"
        }
    }
}

/// 설정 화면 [탈퇴] 확인 뒤의 흐름 (KAN-251). 화면에서 떼어 둔 이유는 ``LoginScreenState``와 같다 — 애플 재인증 갈래를
/// 시뮬레이터 없이 검증하려는 것이다. 안드로이드에는 애플 로그인이 없어 이 단계가 없다.
///
/// 애플 계정이면 탈퇴 직전에 Sign in with Apple을 한 번 더 해 `authorizationCode`를 받아 싣는다. 서버는 애플 토큰을
/// 보관하지 않으므로 이 코드가 있어야 애플 토큰을 revoke할 수 있다(애플 계정 삭제 요구 — "Apps that support Sign in
/// with Apple should use the Sign in with Apple REST API to revoke user tokens").
/// https://developer.apple.com/support/offering-account-deletion-in-your-app
/// https://developer.apple.com/documentation/authenticationservices/asauthorizationappleidcredential/authorizationcode
///
/// - 취소 → **탈퇴 중단**, 서버 호출 없음. 화면은 아무 안내 없이 확인 창으로 돌아간다.
/// - 그 밖의 실패 → 코드 없이 탈퇴한다. 서버는 코드가 없거나 교환이 실패해도 탈퇴를 성공시키고 WARN만 남긴다 —
///   사용자가 iOS 설정에서 연결을 끊을 수 있다(2026-09-29 확정). 탈퇴를 막으면 그쪽이 더 큰 문제다.
///
/// - Returns: nil이면 사용자가 취소해 탈퇴를 멈췄다
@MainActor
public func withdrawAccount(
    provider: Provider,
    appleReauth: () async -> AppleReauth,
    withdraw: (_ appleAuthorizationCode: String?) async -> WithdrawOutcome
) async -> WithdrawOutcome? {
    var code: String?
    if provider == .APPLE {
        switch await appleReauth() {
        case .cancelled: return nil
        case .failed: code = nil
        case .code(let value): code = value
        }
    }
    return await withdraw(code)
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
/// 예외는 로그인 성공(쌍을 처음 저장)과 로그아웃(무조건 비움), 탈퇴(서버가 파기했을 때만 비움) 셋뿐이다.
@MainActor
public final class AuthGateController: ObservableObject {

    @Published public private(set) var state: AuthGateState = .checking

    private let api: AuthApi
    private let store: TokenStore
    private let refresher: TokenRefresher
    private let logoutServerTimeout: Duration
    private let logoutIdpTimeout: Duration
    private let withdrawServerTimeout: Duration

    /// 게이트의 ``login(_:privacyPolicyVersion:)`` 성공으로 저장소에 새 쌍을 저장한 횟수 (KAN-251 리뷰 P1). 탈퇴 정리가
    /// "그사이 새로 로그인했나"를 이것으로 가린다 — ``signOutLocally(_:keepingNewLogin:)`` 참고. 갱신·bootstrap은 같은
    /// 세션의 이어짐이라 올리지 않는다.
    private var loginGeneration = 0

    /// 로그인 저장·세대 증가와 탈퇴 정리의 판정·비우기를 줄 세우는 사슬 (KAN-251 리뷰 P1 재검증 2, 안드로이드 `sessionLock`).
    /// MainActor만으로는 안 된다 — `await store.save`·`await store.clear()`에서 다른 호출이 끼어든다. 정리가 "세대 그대로"로
    /// 판정한 뒤 clear를 기다리는 사이 새 로그인이 저장을 끝내면, 이미 결정된 clear가 새 토큰을 지운다. 그래서
    /// ``TokenRefresher``의 ``tail``처럼 앞 작업이 끝나기를 기다리는 사슬로 묶는다. 안에서는 저장소만 만진다(네트워크·IdP 금지).
    private var sessionTail: Task<Void, Never>?

    private func withSessionLock<T: Sendable>(_ body: @escaping @MainActor () async -> T) async -> T {
        let previous = sessionTail
        let task = Task { @MainActor in
            _ = await previous?.value
            return await body()
        }
        sessionTail = Task { _ = await task.value }
        return await task.value
    }

    /// 진행 중인 탈퇴. 겹친 호출은 이 결과를 함께 기다린다 — ``withdraw(appleAuthorizationCode:idpLogout:)`` 참고.
    private var withdrawal: Task<WithdrawOutcome, Never>?

    /// - Parameters:
    ///   - logoutServerTimeout: 로그아웃의 서버 폐기 단계 상한. 안드로이드 `LOGOUT_SERVER_TIMEOUT`(10초)과 같다
    ///   - logoutIdpTimeout: 로그아웃의 IdP SDK 정리 단계 상한. 안드로이드 `LOGOUT_IDP_TIMEOUT`(5초)과 같다.
    ///   - withdrawServerTimeout: 탈퇴의 서버 단계 상한 (KAN-251). **안드로이드(10초)보다 길게 30초다.** 애플 계정이면
    ///     서버가 애플 호출 둘(코드 교환·revoke, 각 연결 5초 + 읽기 5초)로 최대 약 20초 늦어진다 — 서버 주석 "앱은 이 요청의
    ///     타임아웃을 20초보다 길게 잡는다". 안드로이드에는 애플 로그인이 없어 10초 그대로다. 전송(`URLSession.shared`)의
    ///     요청 상한은 기본 60초라 이보다 먼저 끊지 않는다.
    ///     셋 다 테스트가 짧게 줄이려고 주입한다
    public init(
        api: AuthApi,
        store: TokenStore,
        refresher: TokenRefresher,
        logoutServerTimeout: Duration = .seconds(10),
        logoutIdpTimeout: Duration = .seconds(5),
        withdrawServerTimeout: Duration = .seconds(30)
    ) {
        self.api = api
        self.store = store
        self.refresher = refresher
        self.logoutServerTimeout = logoutServerTimeout
        self.logoutIdpTimeout = logoutIdpTimeout
        self.withdrawServerTimeout = withdrawServerTimeout
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
            let store = store
            let saved = await withSessionLock { [self] in
                let saved = await store.save(success.tokens)
                if saved { loginGeneration += 1 }
                return saved
            }
            guard saved else {
                // 저장되지 않은 첫 로그인은 지금은 들어간 것처럼 보이다가 다음 실행 때 조용히 로그아웃된다(자동 로그인 AC 위반).
                // 메모리에 남은 쌍까지 비우고 실패로 알려 사용자가 다시 시도하게 한다.
                await store.clear()
                state = .signedOut(AuthFailure(.retry))
                return
            }
            state = await withVoiceConsent(Self.state(of: success.account))
        } else {
            state = .signedOut(Self.failure(of: result))
        }
    }

    /// 로그인 응답(LoginResponse)에는 `voiceConsent`가 없어서, 로그인으로 곧장 `signedIn`이 된 계정은 `me()`를 한 번
    /// 더 불러 동의 상태를 채운다 (KAN-270, 안드로이드 `withVoiceConsent`와 같다). 동의 화면은 `signedIn`에 닿을 때
    /// 판정하므로 여기서 모르면 묻지 못한다.
    ///
    /// `me()`가 실패하면 동의를 모르는 채(nil) 들어간다 — 동의는 선택 항목이라 로그인을 막을 이유가 없고, 설정
    /// 화면에서 다시 읽을 수 있다. 갱신 거절로 저장소가 비었으면 로그아웃 콜백이 이미 로그인 화면으로 돌렸다 — 그
    /// 판정을 따른다. `me()`가 프로필 미완료를 말하면(다른 기기에서 지워진 경우) 그쪽이 더 새 정보다.
    private func withVoiceConsent(_ state: AuthGateState) async -> AuthGateState {
        guard case .signedIn = state else { return state }
        if case .success(let account) = await api.me() { return Self.state(of: account) }
        return await store.read() == nil ? .signedOut(nil) : state
    }

    /// 음성 저장 동의를 켜거나 끈다 (KAN-270). ``AuthGateState/signedIn(_:voiceConsent:)``이 아니면 아무것도 보내지 않는다.
    /// 결과를 그대로 돌려줘 화면(동의 화면·설정 토글)이 실패 안내를 그리게 한다 — 상태는 성공일 때만 바꾼다.
    ///
    /// 켤 때 싣는 버전은 서버가 준 ``VoiceConsent/currentVersion``이다. 앱 상수를 두지 않는 이유: 서버가 문안 버전을
    /// 올려도 앱 배포 없이 동의가 계속 맞는 버전으로 나간다(다르면 400). 동의 상태를 모르면(nil) `me()`로 먼저 읽는다.
    public func setVoiceConsent(_ consented: Bool) async -> AuthResult<Account> {
        guard case .signedIn(let user, let known) = state else {
            return .rejected(status: 0, code: nil, message: "로그인 상태가 아님", retryable: false, retryAfterMs: nil)
        }
        let result: AuthResult<Account>
        if consented {
            var version = known?.currentVersion
            if version == nil {
                let me = await api.me()
                guard case .success(let account) = me else { return me }
                version = account.voiceConsent?.currentVersion
            }
            guard let version else {
                return .rejected(status: 0, code: nil, message: "서버가 동의 버전을 주지 않음", retryable: false, retryAfterMs: nil)
            }
            result = await api.consentToVoice(version: version)
        } else {
            result = await api.withdrawVoiceConsent()
        }
        // 요청 한 번 사이에 로그아웃 뒤 다른 계정 로그인이 끝난 경우 앞 계정 응답으로 덮지 않는다(리뷰 P2-4, 이론상 경합).
        if case .success(let account) = result, case .signedIn(let now, _) = state, now.id == user.id {
            state = Self.state(of: account)
        }
        return result
    }

    /// 설정 화면의 [다시 시도] — 동의 상태를 `me()`로 다시 읽는다 (KAN-270). `signedIn`이 아니거나 실패하면 그대로 둔다.
    public func reloadVoiceConsent() async {
        guard case .signedIn(let user, _) = state else { return }
        // 요청 한 번 사이에 로그아웃 뒤 다른 계정 로그인이 끝난 경우 앞 계정 응답으로 덮지 않는다(리뷰 P2-4, 이론상 경합).
        if case .success(let account) = await api.me(), case .signedIn(let now, _) = state, now.id == user.id {
            state = Self.state(of: account)
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
    /// 값이 지워지는 등) 앱이 들고 있던 ``AuthGateState/signedIn(_:voiceConsent:)``이 낡은 것이다 — 추가 정보 화면으로 돌린다.
    public func onProfileIncomplete() {
        guard case .signedIn(let user, _) = state else { return }
        state = .needsProfile(user, error: nil)
    }

    /// 로그아웃. 서버 폐기가 실패해도(망·5xx) **로컬 토큰은 반드시 지운다** — 사용자가 로그아웃을 눌렀는데
    /// 로그인 상태가 남으면 그것이 더 큰 문제다. 서버에 남은 Refresh는 만료로 사라진다.
    ///
    /// 부르는 곳은 추가 정보 화면의 [다른 계정으로 로그인]과 설정 화면의 [로그아웃](KAN-247) 둘이다.
    ///
    /// 단계마다 시간 상한을 둔다 — 서버 ``logoutServerTimeout``, IdP ``logoutIdpTimeout`` (KAN-247, 안드로이드와 같은 계약).
    /// 카카오·네이버 SDK 로그아웃은 콜백을 continuation으로 기다리는데, 콜백이 끝내 안 오면 로그아웃이 영영 끝나지 않아
    /// 설정 화면의 두 버튼이 잠긴 채 남았다. 상한을 넘긴 단계는 버리고 다음으로 간다 — 순서는 서버 → IdP → 로컬 정리 그대로다.
    ///
    /// - Parameter idpLogout: IdP SDK 쪽 로그아웃 (앱 타깃 `IdpLogout.all`). 서버 로그아웃 뒤에 부른다
    public func logout(idpLogout: @escaping @MainActor () async -> Void = {}) async {
        let api = api
        let store = store
        await withDeadline(logoutServerTimeout) {
            if let tokens = await store.read() {
                _ = await api.logout(tokens.refreshToken)
            }
        }
        await signOutLocally(idpLogout)
    }

    /// 회원 탈퇴 (KAN-251, 서버 KAN-241). 애플 5.1.1(v)가 앱 안 탈퇴를 요구한다. 안드로이드 `AuthGateController.withdraw`와
    /// 같은 판정이다.
    ///
    /// **판정이 로그아웃과 반대다.** 로그아웃은 서버가 실패해도 로컬을 지우지만, 탈퇴는 서버가 파기했다고 말할 때만
    /// 정리한다 — 실패를 성공으로 넘기면 사용자는 탈퇴한 줄 아는데 서버에 계정이 남는다.
    /// - 204 → 탈퇴됨.
    /// - 401 → **탈퇴됨으로 친다.** 서버는 파기 커밋 뒤 Refresh를 전부 폐기하므로, 응답 유실 뒤 재시도나 중복 탭으로
    ///   이미 탈퇴한 계정이 다시 보내면 401이 온다. 401이면 토큰도 이미 무효라 남겨 둘 이유가 없다. 이 401에서
    ///   ``AuthorizedSession``의 갱신이 거절되면 ``TokenRefresher``가 저장소를 비우고 먼저 로그인 화면으로 돌리지만,
    ///   IdP 정리는 거기서 하지 않으므로 여기서 끝까지 정리한다.
    /// - 그 밖(전송 실패·서버 단계 상한 ``withdrawServerTimeout`` 초과·5xx·429 등) → 탈퇴 안 됨. 토큰·상태를 그대로 두고
    ///   ``WithdrawOutcome/failed(_:)``. 상한 초과는 응답을 못 받은 것이라 전송 실패와 같이 [다시 시도]다.
    ///   **상한에 지면 요청을 취소한다**(``withCancellingDeadline(_:_:)``, KAN-251 리뷰 P0). 로그아웃처럼 뒤에서 계속 돌게
    ///   두면, 화면에 실패(로그인 유지)를 보인 뒤 늦게 온 401이 자동 갱신 → 갱신 거절로 저장소를 비우고 로그인 화면으로
    ///   돌려 판정이 뒤집히고 IdP 정리도 빠진다. 늦은 204였다면 서버는 이미 탈퇴시켰는데 앱은 로그인 상태로 남는다 —
    ///   다음 요청이 401 → 갱신 거절로 로그인 화면이 되는 것으로 수습된다(안드로이드와 같은 한계).
    ///
    /// 탈퇴됐으면 서버 로그아웃은 부르지 않는다(이미 폐기됐다). IdP 정리 → 로컬 정리 순서와 상한은 ``logout(idpLogout:)``과 같다.
    ///
    /// **시작하면 취소되지 않는다.** 일은 비구조 `Task`가 하고 이 함수는 그 결과를 기다리기만 한다 — 화면의 `Task`가
    /// 취소돼도 `URLSession`에 취소가 번지지 않아 반쪽 정리가 생기지 않는다(안드로이드 `NonCancellable` 자리, KAN-247 리뷰 P1).
    /// 진행 중에 또 불리면 서버 요청을 새로 만들지 않고 진행 중인 결과를 같이 돌려준다. 화면도 진행 중 버튼을 막지만,
    /// 두 번째 요청은 401이라 결과가 같아도 서버에 쓸데없는 탈퇴 요청을 남긴다.
    ///
    /// - Parameters:
    ///   - appleAuthorizationCode: 애플 계정의 재인증 코드 (``withdrawAccount(provider:appleReauth:withdraw:)``). 그 외 nil
    ///   - idpLogout: IdP SDK 쪽 로그아웃 (앱 타깃 `IdpLogout.all`). 탈퇴됐을 때만 부른다
    public func withdraw(
        appleAuthorizationCode: String? = nil,
        idpLogout: @escaping @MainActor () async -> Void = {}
    ) async -> WithdrawOutcome {
        if let running = withdrawal { return await running.value }
        let api = api
        let task = Task { @MainActor in
            defer { withdrawal = nil }
            let result = await withCancellingDeadline(withdrawServerTimeout) {
                await api.withdraw(appleAuthorizationCode: appleAuthorizationCode)
            }
            switch result {
            case .success?, .rejected(statusUnauthorized, _, _, _, _)?:
                await signOutLocally(idpLogout, keepingNewLogin: true)
                return WithdrawOutcome.withdrawn
            case let result?:
                return .failed(Self.failure(of: result))
            case nil:
                return .failed(AuthFailure(.retry))
            }
        }
        withdrawal = task
        return await task.value
    }

    /// 로그아웃·탈퇴 공통 로컬 정리. IdP SDK 정리가 상한 ``logoutIdpTimeout``을 넘겨도 저장소는 비우고 로그인 화면으로 돌린다.
    ///
    /// - Parameter keepingNewLogin: 탈퇴만 true다 (KAN-251 리뷰 P1). 탈퇴 401에서는 갱신 거절이 먼저 저장소를 비우고 로그인
    ///   화면을 띄우므로, IdP 정리(최대 5초)를 기다리는 사이 사용자가 새로 로그인할 수 있다. 그래서 정리 시작 때
    ///   ``loginGeneration``을 잡아 두고, 끝날 때 그대로일 때만 비운다(판정과 비우기는 ``withSessionLock(_:)`` 안에서 한 번에) — 달라졌으면 새 로그인이라 저장소·상태를 건드리지
    ///   않는다. 토큰 값으로 비교하지 않는 이유: 탈퇴 전에 시작된 갱신이 정리 중에 끝나 쌍이 바뀌면 새 로그인으로 오인해
    ///   탈퇴 뒤 로그인이 남는다(리뷰 재검증). 로그아웃은 로그인 상태를 유지한 채 정리해 이 경합이 없어 무조건 비운다.
    private func signOutLocally(_ idpLogout: @escaping @MainActor () async -> Void, keepingNewLogin: Bool = false) async {
        let generation = loginGeneration
        await withDeadline(logoutIdpTimeout, idpLogout)
        let store = store
        await withSessionLock { [self] in
            if keepingNewLogin, loginGeneration != generation { return }
            await store.clear()
            state = .signedOut(nil)
        }
    }

    private static func state(of account: Account) -> AuthGateState {
        switch account.profileStatus {
        case .COMPLETE: return .signedIn(account.user, voiceConsent: account.voiceConsent)
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

/// `operation`과 `limit` 중 먼저 끝나는 쪽에서 돌아온다 (KAN-247, 안드로이드 `withTimeoutOrNull` 자리). 상한에
/// 지면 nil이다 — 탈퇴(KAN-251)는 서버 결과가 필요해 값을 돌려받는다.
///
/// 태스크 그룹 경주로는 안 된다 — 그룹은 자식이 전부 끝나야 빠져나오고, 콜백을 기다리는 `withCheckedContinuation`은
/// 취소를 무시하므로 상한이 지나도 그룹이 함께 매달린다. 그래서 둘을 따로 띄우고 continuation 하나를 먼저 도착한 쪽이
/// 한 번만 재개한다. 상한에 진 `operation`은 멈추지 않고 뒤에서 계속 돈다 — 취소에 응하지 않는 작업을 멈출 방법이
/// 없고, 로그아웃에서는 늦게 끝나도 해가 없다(서버 폐기·SDK 세션 정리일 뿐이다).
@MainActor
@discardableResult
func withDeadline<T: Sendable>(_ limit: Duration, _ operation: @escaping @MainActor () async -> T) async -> T? {
    await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
        let once = ResumeOnce(continuation)
        let timer = Task {
            try? await Task.sleep(for: limit)
            once.resume(nil)
        }
        Task { @MainActor in
            let value = await operation()
            timer.cancel()
            once.resume(value)
        }
    }
}

/// ``withDeadline(_:_:)``과 같되 상한에 지면 `operation`을 취소한다 (KAN-251 리뷰 P0, 탈퇴 전용). 안드로이드
/// `withTimeoutOrNull`이 코루틴을 취소해 OkHttp 호출을 끊는 것(`HttpAwait.kt`의 `invokeOnCancellation { call.cancel() }`)과
/// 같은 자리다. `URLSession`의 async API는 태스크 취소를 존중해 요청을 끊고 `URLError.cancelled`를 던지므로
/// ``AuthApi``는 전송 실패로 끝나고, 늦은 응답이 ``AuthorizedSession``의 자동 갱신을 시작하지 않는다.
/// 로그아웃은 늦게 끝나도 해가 없어 그대로 ``withDeadline(_:_:)``을 쓴다.
@MainActor
func withCancellingDeadline<T: Sendable>(_ limit: Duration, _ operation: @escaping @MainActor () async -> T) async -> T? {
    let work = Task { @MainActor in await operation() }
    let result = await withDeadline(limit) { await work.value }
    if result == nil { work.cancel() }
    return result
}

/// continuation을 두 번 재개하면 크래시다 — 어느 쪽이 먼저 와도 한 번만 넘긴다. 타이머는 메인 밖에서 오므로 잠근다.
private final class ResumeOnce<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T?, Never>?

    init(_ continuation: CheckedContinuation<T?, Never>) {
        self.continuation = continuation
    }

    func resume(_ value: T?) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        pending?.resume(returning: value)
    }
}
