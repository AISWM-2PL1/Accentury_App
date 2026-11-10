import Combine
import Foundation

/// 가입 시 동의받는 개인정보처리방침의 버전 (KAN-224, KAN-240, KAN-269, KAN-286).
///
/// 안드로이드 `auth/LoginScreenState.kt`의 `PRIVACY_POLICY_VERSION`과 **같은 값**이다. 게시된 방침(서버 레포
/// `infra/privacy/privacy.html`의 `accentury-policy-version` 메타)의 버전이고, 서버는 이 값과 정확히 같은
/// 동의만 받는다(다르면 400 AUTH_CONSENT_REQUIRED). 방침이 개정되면 두 플랫폼을 같은 커밋에서 올린다.
/// 지금 값은 학습 홈의 출석 기록을 반영한 개정본(KAN-286)의 버전이다. 그 앞은 음성 저장 선택 동의 개정본(KAN-269)의 2026-10-04다.
public let privacyPolicyVersion = "2026-10-20"

/// 방침 문서 주소. 웹·안드로이드와 같은 값이고 같은 이유로 **환경과 무관하게 prod 문서다** — 디버그의
/// WEB_URL(로컬 Vite)에는 이 정적 파일이 없고, 법적 고지는 정본이 하나여야 한다.
public let privacyPolicyURL = "https://accentury.app/privacy.html"

/// 문의처 메일 (KAN-330). 방침 13항 문의처·App Store 연락처 이메일과 같은 주소다(docs/wiki/app-store-listing.md §3·§8).
public let supportEmail = "team2pl1@gmail.com"

/// 설정 「광고 신고」의 메일 작성 주소 (KAN-330, App Store 지침 1.2 — 사용자가 부적절한 콘텐츠를 신고할 수단). 광고는 AdMob이 고르므로
/// 우리가 막을 자리는 AdMob 콘솔의 광고 검토 센터다. 그래서 신고를 받는 통로만 두고, 찾는 데 필요한 값(언제·어느 화면·어떤 광고)을
/// 본문 틀로 묻는다. 메일 앱이 없는 기기는 열리지 않으므로 화면이 주소를 함께 보인다.
/// https://developer.apple.com/app-store/review/guidelines/#user-generated-content
public func adReportMailURL(appVersion: String) -> URL? {
    var components = URLComponents()
    components.scheme = "mailto"
    components.path = supportEmail
    components.queryItems = [
        URLQueryItem(name: "subject", value: "[광고 신고] Accentury"),
        URLQueryItem(
            name: "body",
            value: "신고할 광고에 대해 알려 주세요.\n\n- 광고가 나온 화면(예: 분석 대기, 다시 테스트하기 전):\n- 본 날짜와 시각:\n"
                + "- 광고 내용(광고주·문구, 캡처를 붙여 주시면 확인이 빨라요):\n- 문제라고 느낀 점:\n\n앱 버전: \(appVersion)"
        ),
    ]
    return components.url
}

/// 로그인 화면이 버튼을 세우는 순서 (KAN-224 팀 결정 2026-09-28: "구글, 카카오, 네이버, iOS는 apple 추가").
/// 안드로이드 `LOGIN_PROVIDERS` 끝에 APPLE 하나를 더한 것이다.
public let loginProviders: [Provider] = [.GOOGLE, .KAKAO, .NAVER, .APPLE]

/// 이 빌드에 보일 로그인 버튼. 설정(클라이언트 ID·키)이 빈 제공자는 숨긴다 — 눌러야 SDK 오류로 떨어질 버튼을
/// 세워 둘 이유가 없다. 가짜 IdP면 설정과 무관하게 넷 다 보인다(SDK를 부르지 않는다).
/// APPLE은 설정이 필요 없어(앱 번들 식별자와 entitlement가 전부다) 호출부가 늘 `configured`에 넣는다.
public func visibleProviders(configured: Set<Provider>, fakeIdp: Bool) -> [Provider] {
    loginProviders.filter { fakeIdp || configured.contains($0) }
}

/// 설정 화면의 로그인 방식 표기 (KAN-247, 안드로이드 `auth/SettingsScreen.kt`의 `providerName`과 같은 값).
/// 로그인 버튼의 라벨(앱 타깃 `LoginScreen`의 `providerLabel`, "Google로 계속하기" 꼴)과 따로 두는 이유: 저쪽은 각 사
/// 버튼 가이드의 표기를 따르고, 여기는 사용자가 읽는 한국어 문장 속 값이다. Core에 두는 것은 `swift test`로 넷을 다
/// 확인하려고다 (``Gender/label``과 같은 자리).
public func providerName(_ provider: Provider) -> String {
    switch provider {
    case .GOOGLE: return "구글"
    case .KAKAO: return "카카오"
    case .NAVER: return "네이버"
    case .APPLE: return "애플"
    // 게스트 설정 화면은 계정 섹션을 세우지 않아 이 값이 화면에 닿지 않는다 (KAN-330). 빈칸 대신 읽히는 말을 둔다.
    case .GUEST: return "로그인 없이 둘러보기"
    }
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
public func loginCredential(
    of provider: Provider,
    token: String,
    refreshToken: String? = nil,
    nonce: String? = nil,
    name: String? = nil
) -> LoginCredential {
    switch provider {
    case .GOOGLE, .APPLE:
        return LoginCredential(provider: provider, idToken: token, nonce: nonce, name: name)
    case .KAKAO:
        return LoginCredential(provider: provider, accessToken: token)
    case .NAVER:
        // 네이버는 Refresh 토큰도 필수다 (KAN-243). 네이버 사용자 조회 API는 토큰의 발급 앱을 알려 주지 않아서, 서버가
        // 이 Refresh 토큰을 우리 Client로 교환해 봐야 우리 앱의 토큰인지 가릴 수 있다. 없으면 400 `VALIDATION_FAILED`다.
        return LoginCredential(provider: provider, accessToken: token, refreshToken: refreshToken)
    case .GUEST:
        // 게스트는 로그인으로 만들지 않는다(서버가 400으로 거절한다, KAN-329). 버튼 목록에 없어 여기 오지 않는다.
        return LoginCredential(provider: provider)
    }
}

/// 가짜 IdP의 자격 (KAN-224, 디버그 `FAKE_IDP`). 서버가 `accentury.auth.fake-idp=true`면 `fake:<sub>`를
/// IdP에 묻지 않고 그 sub로 로그인시킨다 (서버 `IdpVerifiers`, sub 형식 `[A-Za-z0-9._-]{1,64}`). 안드로이드와 같은 형식이다.
///
/// **애플은 nonce도 싣는다.** 서버가 필수 필드 검사(애플이면 nonce 필수)를 가짜 판정보다 먼저 한다 — 빠뜨리면
/// 가짜 로그인도 400 `VALIDATION_FAILED`다. 값은 진짜 흐름과 같이 새로 만든 원문 nonce다.
public func fakeLoginCredential(_ provider: Provider) -> LoginCredential {
    let token = "fake:dev-\(provider.rawValue.lowercased())"
    // 네이버는 Refresh 칸도 채운다. 서버가 필수 필드 검사를 가짜 판정보다 먼저 하기 때문이다 (KAN-243).
    return loginCredential(
        of: provider,
        token: token,
        refreshToken: provider == .NAVER ? token : nil,
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

    /// 「로그인 없이 둘러보기」 동의 단계의 「만 14세 이상입니다」 (KAN-330, 필수). 소셜 가입은 추가 정보의 생년월일이 나이를
    /// 확인하지만 게스트에게는 그 화면이 없어 여기서 받는다. 방침 동의는 소셜 로그인과 같은 ``consented``를 쓴다 — 같은 방침·같은 버전이다.
    @Published public var ageConfirmed = false

    public init(consented: Bool = false) {
        self.consented = consented
    }

    public var buttonsEnabled: Bool { consented && !inFlight }

    /// 게스트 [둘러보기 시작]을 누를 수 있나 (KAN-330). 동의 둘 다 필수다.
    public var guestEnabled: Bool { consented && ageConfirmed && !inFlight }

    /// 게스트 발급을 시작한다 (KAN-330). 진행 중 막기는 소셜 로그인과 같은 ``inFlight``다 — 둘이 동시에 나가면 토큰 쌍 둘이 서로를 덮는다.
    /// 결과 안내는 게이트의 ``AuthGateState/signedOut(_:)``이 든다. 막혀 있을 때 들어온 호출은 무시한다.
    public func startGuest(_ start: () async -> Void) async {
        guard guestEnabled else { return }
        inFlight = true
        idpError = nil
        defer { inFlight = false }
        await start()
    }

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
