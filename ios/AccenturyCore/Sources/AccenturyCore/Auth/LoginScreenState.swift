import Combine
import Foundation

/// 가입 시 동의받는 개인정보처리방침의 버전 (KAN-224, 서버 형식 `[A-Za-z0-9._-]{1,32}`).
///
/// 안드로이드 `auth/LoginScreenState.kt`의 `PRIVACY_POLICY_VERSION`과 **같은 값**이다 — 게시된 방침(서버 레포
/// `infra/privacy/privacy.html`)의 마지막 본문 개정일. 방침이 다시 게시되면 두 플랫폼을 같은 커밋에서 올린다.
public let privacyPolicyVersion = "2026-09-15"

/// 방침 문서 주소. 웹·안드로이드와 같은 값이고 같은 이유로 **환경과 무관하게 prod 문서다** — 디버그의
/// WEB_URL(로컬 Vite)에는 이 정적 파일이 없고, 법적 고지는 정본이 하나여야 한다.
public let privacyPolicyURL = "https://accentury.app/privacy.html"

/// 로그인 화면이 버튼을 세우는 순서 (KAN-224 팀 결정 2026-09-28: "구글, 카카오, 네이버, iOS는 apple 추가").
/// 안드로이드 `LOGIN_PROVIDERS` 끝에 APPLE 하나를 더한 것이다.
public let loginProviders: [Provider] = [.GOOGLE, .KAKAO, .NAVER, .APPLE]

/// 이 빌드에 보일 로그인 버튼. 설정(클라이언트 ID·키)이 빈 제공자는 숨긴다 — 눌러야 SDK 오류로 떨어질 버튼을
/// 세워 둘 이유가 없다. 가짜 IdP면 설정과 무관하게 넷 다 보인다(SDK를 부르지 않는다).
/// APPLE은 설정이 필요 없어(앱 번들 식별자와 entitlement가 전부다) 호출부가 늘 `configured`에 넣는다.
public func visibleProviders(configured: Set<Provider>, fakeIdp: Bool) -> [Provider] {
    loginProviders.filter { fakeIdp || configured.contains($0) }
}

/// IdP SDK 로그인 한 번의 결말 (KAN-224).
public enum IdpOutcome: Equatable, Sendable {

    /// SDK가 토큰을 줬다 — 서버 로그인으로 넘긴다.
    case credential(LoginCredential)

    /// 사용자가 SDK 화면에서 물러났다. 안내할 오류가 아니다 — 로그인 화면에 조용히 돌아온다.
    case cancelled

    /// SDK가 토큰을 주지 못했다 (계정 없음·망·SDK 오류). 로그인 화면이 [다시 시도] 안내를 띄운다.
    case failed
}

/// 제공자별로 토큰을 싣는 칸을 가른다 — 서버 계약(§3.9, 서버 `AuthService.credential`)이 GOOGLE·APPLE은
/// `idToken`, KAKAO·NAVER는 `accessToken`을 읽는다. 다른 칸에 실으면 400 `VALIDATION_FAILED`다.
public func loginCredential(of provider: Provider, token: String, nonce: String? = nil, name: String? = nil) -> LoginCredential {
    switch provider {
    case .GOOGLE, .APPLE:
        return LoginCredential(provider: provider, idToken: token, nonce: nonce, name: name)
    case .KAKAO, .NAVER:
        return LoginCredential(provider: provider, accessToken: token)
    }
}

/// 가짜 IdP의 자격 (KAN-224, 디버그 `FAKE_IDP`). 서버가 `accentury.auth.fake-idp=true`면 `fake:<sub>`를
/// IdP에 묻지 않고 그 sub로 로그인시킨다 (서버 `IdpVerifiers`, sub 형식 `[A-Za-z0-9._-]{1,64}`). 안드로이드와 같은 형식이다.
///
/// **애플은 nonce도 싣는다.** 서버가 필수 필드 검사(애플이면 nonce 필수)를 가짜 판정보다 먼저 한다 — 빠뜨리면
/// 가짜 로그인도 400 `VALIDATION_FAILED`다. 값은 진짜 흐름과 같이 새로 만든 원문 nonce다.
public func fakeLoginCredential(_ provider: Provider) -> LoginCredential {
    loginCredential(
        of: provider,
        token: "fake:dev-\(provider.rawValue.lowercased())",
        nonce: provider == .APPLE ? AppleNonce.make() : nil
    )
}

/// 로그인 화면의 상태 (KAN-224). 안드로이드 `LoginScreenState`의 이식본이다 — "언제 누를 수 있나"와
/// "취소는 오류가 아니다"라는 규칙을 `swift test`로 검증하려고 화면에서 떼어 냈다.
///
/// 서버 로그인의 실패 안내는 ``AuthGateController``의 ``AuthGateState/signedOut(_:)``이 들고, 여기는 서버에
/// 닿기 전 IdP 단계의 실패(``idpError``)만 든다.
@MainActor
public final class LoginScreenState: ObservableObject {

    /// 개인정보 수집·이용 동의(필수). 동의 없이 로그인 버튼이 눌리지 않는 것이 ``AuthApi/login(_:privacyPolicyVersion:)``의 전제다.
    @Published public var consented: Bool

    /// IdP 화면 또는 서버 로그인이 도는 중 — 두 번째 탭이 두 번째 로그인을 내보내지 않게 막는다.
    @Published public private(set) var inFlight = false

    /// IdP SDK가 토큰을 주지 못했다. 다음 시도를 시작하면 지운다.
    @Published public private(set) var idpError: AuthFailure?

    public init(consented: Bool = false) {
        self.consented = consented
    }

    public var buttonsEnabled: Bool { consented && !inFlight }

    /// 버튼 하나를 눌렀다. `idp`로 SDK 로그인을 하고, 토큰을 받으면 `login`(서버 로그인)으로 넘긴다.
    /// 취소는 아무 흔적도 남기지 않는다. 막혀 있을 때(``buttonsEnabled``가 false) 들어온 호출은 무시한다.
    public func signIn(idp: () async -> IdpOutcome, login: (LoginCredential) async -> Void) async {
        guard buttonsEnabled else { return }
        inFlight = true
        idpError = nil
        defer { inFlight = false }
        switch await idp() {
        case .credential(let credential): await login(credential)
        case .cancelled: break
        case .failed: idpError = AuthFailure(.retry)
        }
    }
}
