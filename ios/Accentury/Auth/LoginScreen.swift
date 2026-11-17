import AccenturyCore
import AuthenticationServices
import SwiftUI
import UIKit

/// 로그인 화면 (KAN-224). 인트로(웹)보다 앞에 서는 필수 관문이다. 안드로이드 `auth/LoginScreen.kt`의 이식본이다.
///
/// 버튼은 각 사 가이드의 면·글자·문구를 따른다 (2026-11-11 결정, KAN-355 2단계 — 2026-09-28 「Papercut 보조 버튼 유지」를
/// 대체, docs/wiki/social-login-logos.md). 순서는 구글 → 카카오 → 네이버 → 애플이고 넷 다 같은 크기다 — 애플을 다른
/// 소셜 로그인과 같은 무게로 두는 것이 App Review 4.8의 요구다.
struct LoginScreen: View {

    /// 방금 실패한 서버 로그인의 안내 (``AccenturyCore/AuthGateState/signedOut(_:)``)
    let error: AuthFailure?
    /// 이 빌드에 보일 버튼 (``AccenturyCore/visibleProviders(configured:fakeIdp:)``)
    let providers: [Provider]
    /// 버튼 하나의 IdP 로그인. 실제 빌드는 ``idpSignIn(_:)``
    let signIn: (Provider) async -> IdpOutcome
    /// 토큰을 받은 뒤의 서버 로그인 (``AccenturyCore/AuthGateController/login(_:privacyPolicyVersion:)``)
    let onLogin: (LoginCredential) async -> Void
    /// 「로그인 없이 둘러보기」 동의를 마친 뒤의 게스트 발급 (KAN-330, ``AccenturyCore/AuthGateController/startGuest(privacyPolicyVersion:)``)
    let onStartGuest: () async -> Void
    /// [보기] — 방침 문서를 연다
    let onOpenPrivacy: () -> Void

    @StateObject private var state = LoginScreenState()
    /// 「로그인 없이 둘러보기」를 눌러 동의 단계에 있다 (KAN-330). 화면을 갈지 않고 아래 묶음만 바꾼다 — 히어로와 실패 안내 자리가 그대로다.
    @State private var guestStep = false

    var body: some View {
        // 키 작은 화면에서는 히어로와 버튼이 겹치지 않고 스크롤된다 — 최소 높이만 화면에 맞추고 넘치면 늘어난다.
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    // 히어로는 아래 묶음 위 남은 칸의 세로 가운데에 선다 (2026-09-28 팀장 결정, 안드로이드와 같은 규칙) —
                    // 웹 `.screen__body`의 justify-content center다. 위아래 Spacer가 같은 몫을 나눠 가져 어느 높이에서도 가운데다.
                    Spacer(minLength: 0)
                    IntroHero()
                    Spacer(minLength: Papercut.space6)

                    // 아래 묶음 — 웹 인트로의 CTA·안내 자리. 실패 안내·대기 표시는 버튼 바로 위에 붙는다.
                    VStack(spacing: Papercut.space4) {
                        statusRow
                        if guestStep {
                            guestConsent
                        } else {
                            // 시안 s-01-login 세로 간격: 버튼 사이 10, 버튼 묶음 → 동의 줄 22, 동의 줄 → 둘러보기 4.
                            VStack(spacing: 0) {
                                VStack(spacing: IdpBrand.buttonSpacing) {
                                    ForEach(providers, id: \.self) { provider in
                                        if provider == .APPLE {
                                            // 애플은 시스템 버튼이다 (KAN-344-6, App Review 4.8 + HIG Sign in with Apple). 로고·글자를 우리가
                                            // 그리면 HIG 위반으로 거절될 수 있다. 흐름(AppleIdp)과 막기 규칙은 다른 버튼과 같다.
                                            AppleSignInButton(enabled: state.buttonsEnabled) {
                                                Task { await state.signIn(idp: { await signIn(provider) }, login: onLogin) }
                                            }
                                        } else {
                                            IdpButton(provider: provider, enabled: state.buttonsEnabled) {
                                                Task { await state.signIn(idp: { await signIn(provider) }, login: onLogin) }
                                            }
                                        }
                                    }
                                }
                                ConsentRow(checked: $state.consented, onOpenPrivacy: onOpenPrivacy)
                                    .padding(.top, 22)
                                // 계정 없이 쓸 수 있는 기능(사투리 번역기)의 입구 (KAN-330, App Store 지침 5.1.1(v)). 소셜 버튼보다 가볍게 글자 버튼이다.
                                AccenturyButton(text: "로그인 없이 둘러보기", variant: .text, enabled: !state.inFlight) { guestStep = true }
                                    .padding(.top, Papercut.space1)
                            }
                        }
                    }
                }
                .padding(.horizontal, Papercut.space6)
                .padding(.top, Papercut.space2)
                .padding(.bottom, Papercut.space8)
                .frame(minHeight: geometry.size.height)
            }
        }
        // 워드마크 앱바 (KAN-288 디자인 3). 위 8 + 앱바 48 + 8 = 예전 위 여백 64라 본문 시작 높이는 그대로다.
        .paperAppBar()
    }

    /// 게스트 동의 단계 (KAN-330). 방침 동의(소셜 로그인과 같은 값·같은 버전)와 만 14세 이상 확인 둘 다 필수다 — 게스트에게는 생년월일을
    /// 받는 추가 정보 화면이 없어 나이를 여기서 확인한다(가입 연령 제한, 방침 7항). 서버는 동의 두 필드만 받는다.
    private var guestConsent: some View {
        // 시안 s-01b-login-guest: 줄 사이 6, [둘러보기 시작] 위 10 더, 뒤에 → 선화.
        VStack(alignment: .leading, spacing: 6) {
            Text("로그인 없이 둘러보기")
                .papercutType(.headline)
                .foregroundColor(Papercut.ink)
                .accessibilityAddTraits(.isHeader)
            Text("사투리 번역기를 바로 쓸 수 있어요. 억양 학습과 단어 학습은 로그인한 뒤에 쓸 수 있어요")
                .papercutType(.bodySmall)
                .foregroundColor(Papercut.muted)
                .fixedSize(horizontal: false, vertical: true)
            ConsentRow(checked: $state.consented, onOpenPrivacy: onOpenPrivacy)
            CheckRow(checked: $state.ageConfirmed, label: "만 14세 이상입니다 (필수)")
            AccenturyButton(text: "둘러보기 시작", enabled: state.guestEnabled, fillsWidth: true, trailingIcon: "arrow.right") {
                Task { await state.startGuest(onStartGuest) }
            }
            .padding(.top, 10)
            // 시안 `.p1-guest`: 가운데 정렬·늘 밑줄
            AccenturyButton(text: "돌아가기", variant: .text, enabled: !state.inFlight, fillsWidth: true, underlined: true) { guestStep = false }
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        if providers.isEmpty {
            // 설정이 하나도 없는 빌드 — 가짜 IdP도 꺼져 있으면 누를 것이 없다. 사용자에게는 업데이트 안내다.
            AuthFailureBlock(failure: AuthFailure(.unsupported), verb: "로그인")
        } else if let shown = state.idpError ?? error {
            AuthFailureBlock(failure: shown, verb: "로그인")
        } else if state.inFlight {
            // 서버 로그인까지 도는 동안 버튼은 흐려지고 여기서 기다림을 알린다.
            ProgressView().progressViewStyle(.circular).tint(Papercut.ink)
        }
    }
}

/// 웹 인트로의 상단 블록을 그대로 옮겼다 (KAN-224, `web/src/intro/IntroScreen.tsx` `.intro-hero`) — 앱 첫 화면이
/// 테스트 인트로와 같은 얼굴이어야 한다. 워드마크는 브랜드 표기라 평문이고, 화면 이름은 두 줄 히어로 하나만
/// 제목이다(웹 h1). 밑줄은 장식이라 스크린 리더에서 뺀다.
private struct IntroHero: View {

    /// text-intro-hero 56 · leading-tight 1.15(=64) — 네이티브 타입 슬롯에 없는 웹 전용 크기라 여기서만 적는다
    /// (design-tokens.md §8, 안드로이드 LoginScreen과 같은 값).
    private static let heroSize: CGFloat = 56
    private static let heroLineHeight: CGFloat = 64

    var body: some View {
        VStack(spacing: Papercut.space2) {
            Text("Accentury")
                .papercutType(.title)
                .foregroundColor(Papercut.ink)
            // 밑줄 폭 = 제목 글자 폭 (웹 `.intro-heading`이 글자 폭으로 줄고 svg가 width 100%). fixedSize가 이 묶음을
            // 제목 폭으로 줄이고, 밑줄은 그 폭을 끝까지 쓴다.
            VStack(spacing: Papercut.space1) {
                Text("사투리\n좀 치나?")
                    .font(.custom(Papercut.juaFamily, fixedSize: Self.heroSize))
                    .lineSpacing(Self.heroLineSpacing)
                    .multilineTextAlignment(.center)
                    .foregroundColor(Papercut.ink)
                    .accessibilityAddTraits(.isHeader)
                HeroUnderline()
                    .frame(maxWidth: .infinity)
                    .frame(height: Papercut.space3)
                    .accessibilityHidden(true)
            }
            .fixedSize()
            Text("내 목소리로 확인하는 사투리 억양")
                .papercutType(.bodySmall)
                .foregroundColor(Papercut.muted)
                .multilineTextAlignment(.center)
        }
    }

    /// 64에서 Jua 56의 자연 줄 높이를 뺀 값 (``Papercut/TextStyle/resolvedLineSpacing``과 같은 셈).
    private static var heroLineSpacing: CGFloat {
        guard let natural = UIFont(name: Papercut.juaFamily, size: heroSize)?.lineHeight else { return heroLineHeight - heroSize }
        return max(heroLineHeight - natural, 0)
    }
}

/// 웹 svg viewBox 0 0 200 12, `M 4 3.5 Q 100 13.5 196 3.5`, preserveAspectRatio none + non-scaling-stroke:
/// 좌표만 상자에 늘리고 굵기(7)는 그대로다. 포인트 컬러 한 자리.
private struct HeroUnderline: View {
    var body: some View {
        Canvas { context, size in
            let sx = size.width / 200
            let sy = size.height / 12
            var path = Path()
            path.move(to: CGPoint(x: 4 * sx, y: 3.5 * sy))
            path.addQuadCurve(to: CGPoint(x: 196 * sx, y: 3.5 * sy), control: CGPoint(x: 100 * sx, y: 13.5 * sy))
            context.stroke(path, with: .color(Papercut.point), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        }
    }
}

/// 필수 동의 한 줄. 줄 전체가 체크박스 하나로 읽히고 눌린다(48 터치). [보기]는 따로 눌리는 글자 버튼이다.
private struct ConsentRow: View {

    @Binding var checked: Bool
    let onOpenPrivacy: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            CheckRow(checked: $checked, label: "개인정보 수집·이용 동의 (필수)")
            // 시안 `.p1-required .btn`: 좌우 여백 0·최소 폭 44 — 오른쪽 끝이 본문 오른쪽 선에 닿는다.
            AccenturyButton(text: "보기", variant: .text, flush: true, action: onOpenPrivacy)
        }
    }
}

/// 체크박스 한 줄 — 방침 동의와 게스트의 만 14세 확인(KAN-330)이 같은 모양을 쓴다.
private struct CheckRow: View {

    @Binding var checked: Bool
    let label: String

    var body: some View {
        Button { checked.toggle() } label: {
            HStack(spacing: Papercut.space3) {
                ConsentCheckMark(checked: checked)
                Text(label)
                    .papercutType(.bodySmall)
                    .foregroundColor(Papercut.ink)
                Spacer(minLength: 0)
            }
            .frame(minHeight: Papercut.touchTargetMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(checked ? .isSelected : [])
    }
}

/// 시스템 Sign in with Apple 버튼 (KAN-344-6). `SignInWithAppleButton`(SwiftUI)은 요청·완료를 버튼이 직접 처리해서 지금의 흐름
/// (``AppleIdp``의 nonce·재인증 공용 `ASAuthorizationController`)을 갈라 놓는다 — 그래서 UIKit 버튼을 감싸 탭만 받는다. 모양은 검정
/// 면(`.black`, KAN-355 2단계 — 다른 셋이 각 사 면색을 쓰므로 애플도 HIG 기본 면), 글자는 `continue`(「Apple로 계속하기」, 시스템이
/// 현지화)다. 높이·모서리는 다른 IdP 버튼(48·12)과 맞춘다 — HIG는 최소 높이 30pt 이상, 모서리 반경은 앱에 맞춰 바꿀 수 있다고 한다.
/// https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
/// https://developer.apple.com/documentation/authenticationservices/asauthorizationappleidbutton
private struct AppleSignInButton: View {

    let enabled: Bool
    let action: () -> Void

    var body: some View {
        AppleIdButtonView(action: action)
            .frame(maxWidth: .infinity)
            .frame(height: IdpBrand.height)
            .disabled(!enabled)
            .opacity(enabled ? 1 : Papercut.opacityDisabled)
    }
}

private struct AppleIdButtonView: UIViewRepresentable {

    let action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(authorizationButtonType: .continue, authorizationButtonStyle: .black)
        button.cornerRadius = IdpBrand.cornerRadius
        button.addTarget(context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
        return button
    }

    func updateUIView(_ button: ASAuthorizationAppleIDButton, context: Context) {
        context.coordinator.action = action
        // SwiftUI `.disabled`는 UIKit 컨트롤에 번지지 않는다 — 막기는 ``LoginScreenState/buttonsEnabled``와 같은 값을 직접 건다.
        button.isEnabled = context.environment.isEnabled
    }

    final class Coordinator: NSObject {
        var action: () -> Void = {}
        @objc func tapped() { action() }
    }
}

/// 체크박스 그림 한 칸 (모양은 KAN-355 시안 `.p1-check`). 안드로이드 Material 체크박스 자리다. 22 칸에 잉크 1 테두리, 체크하면
/// 크림 4 띠 안쪽이 벽돌로 찬다. 로그인 필수 동의와 음성 저장 선택 동의(``VoiceConsentScreen``, KAN-270)가 같은 그림을 쓴다.
struct ConsentCheckMark: View {
    let checked: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: Papercut.radiusSM, style: .continuous)
            .strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline)
            .background {
                if checked {
                    // 시안 `box-shadow: inset 0 0 0 4px` — 테두리 안쪽 크림 4를 남기고 벽돌.
                    RoundedRectangle(cornerRadius: 1, style: .continuous).fill(Papercut.point).padding(Papercut.space1)
                }
            }
            .frame(width: 22, height: 22)
    }
}

/// IdP 버튼 값 (KAN-355 2단계, 시안 s-01-login `.p1-brand`). 면·글자 색은 각 사 가이드 값이라 Papercut 팔레트에 두지 않고
/// 여기 한곳에 모은다(출처는 docs/wiki/social-login-logos.md).
private enum IdpBrand {
    static let height: CGFloat = 48
    static let cornerRadius: CGFloat = 12
    static let buttonSpacing: CGFloat = 10
    /// 시스템 글꼴 19 Medium — 시스템 Apple 버튼(높이 48)이 그리는 글자와 같은 크기로 맞춘다(2026-11-17, 캡처 실측 15×1.26). 시안 15에서 올렸다. Jua 라벨 규칙은 받지 않는다.
    static let labelSize: CGFloat = 19
    /// 로고+라벨 묶음 양옆 최소 여백.
    static let labelInset: CGFloat = 16
    /// 로고와 라벨 사이 — 로고는 라벨 바로 앞에 붙어 함께 가운데에 선다(시스템 Apple 버튼과 같은 배치, 2026-11-17).
    static let logoGap: CGFloat = 8
    /// 눌림 덮개 — 각 사 면색 위에 검정 8%를 얹어 면 위에서 눌림이 읽히게 한다(공용 버튼의 내려앉음을 쓰지 않는다).
    static let pressedOverlay: Double = 0.08

    static func face(_ provider: Provider) -> Color {
        switch provider {
        case .GOOGLE: return Color(red: 0xF2 / 255, green: 0xF2 / 255, blue: 0xF2 / 255)  // Neutral #F2F2F2
        case .KAKAO: return Color(red: 0xFE / 255, green: 0xE5 / 255, blue: 0x00 / 255)  // #FEE500
        case .NAVER: return Color(red: 0x03 / 255, green: 0xC7 / 255, blue: 0x5A / 255)  // #03C75A
        case .APPLE, .GUEST: return .black
        }
    }

    static func label(_ provider: Provider) -> Color {
        switch provider {
        case .GOOGLE: return Color(red: 0x1F / 255, green: 0x1F / 255, blue: 0x1F / 255)  // #1F1F1F
        case .KAKAO: return Color.black.opacity(0.85)  // #000000 85%
        case .NAVER, .APPLE, .GUEST: return .white
        }
    }

}

/// 구글·카카오·네이버 로그인 버튼 (KAN-355 2단계). 면·글자·문구는 각 사 가이드, 로고는 문구 바로 앞에 붙어 함께 가운데다(시스템 Apple 버튼과 같은 배치, 2026-11-17).
/// 비활성(방침 동의 전)은 버튼 전체를 ``Papercut/opacityDisabled``로 흐린다 — 각 사 면색이 크림 위에서 바래 보여 면 위에서
/// 구별되고, 공용 버튼의 비활성 모양(종이 그림자 면)은 각 사 면색을 지우므로 쓰지 않는다.
private struct IdpButton: View {
    let provider: Provider
    let enabled: Bool
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            HStack(spacing: IdpBrand.logoGap) {
                IdpLogo(provider: provider)
                Text(loginButtonLabel(provider))
                    .font(.system(size: IdpBrand.labelSize, weight: .medium))
                    .foregroundColor(IdpBrand.label(provider))
                    .lineLimit(1)
            }
            .padding(.horizontal, IdpBrand.labelInset)
            .frame(maxWidth: .infinity, minHeight: IdpBrand.height)
        }
        .buttonStyle(IdpButtonStyle(face: IdpBrand.face(provider), reduceMotion: reduceMotion))
        .disabled(!enabled)
        .opacity(enabled ? 1 : Papercut.opacityDisabled)
    }
}

/// IdP 버튼의 면과 눌림. 눌림은 1단계 공용 규칙(75ms)이고 동작 줄이기면 바로 끝 상태다.
private struct IdpButtonStyle: ButtonStyle {
    let face: Color
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: IdpBrand.cornerRadius, style: .continuous)
        return configuration.label
            .background(shape.fill(face))
            .overlay(shape.fill(Color.black.opacity(configuration.isPressed ? IdpBrand.pressedOverlay : 0)))
            .contentShape(shape)
            .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.press), value: configuration.isPressed)
    }
}

/// IdP 공식 로고 (KAN-224, 색은 KAN-355). 파일 출처는 social-login-logos.md. 크기는 시안 s-01-login의 `<img>` 값이다.
/// 애플은 시스템 버튼이 로고까지 그린다. 버튼 글자가 이미 제공자를 말하므로 스크린 리더에는 읽히지 않는다.
private struct IdpLogo: View {
    let provider: Provider

    var body: some View {
        Group {
            switch provider {
            case .GOOGLE: Image("IdpGoogle").resizable().frame(width: 20, height: 20)
            case .KAKAO: Image("IdpKakao").resizable().scaledToFit().frame(width: 18, height: 17)
            case .NAVER: Image("IdpNaverWhite").resizable().frame(width: 16, height: 16)
            case .APPLE, .GUEST: EmptyView()
            }
        }
        .accessibilityHidden(true)
    }
}

/// 인증 실패 안내 (KAN-224). ``SessionGateScreen``의 실패 문구와 같은 말투다 — 비난 없이, 지금 할 수 있는 것 하나.
/// 복구 동작은 화면이 따로 둔다(로그인은 IdP 버튼, 추가 정보는 [완료], 시작 확인은 [다시 시도]).
///
/// - `verb`: 실패한 동작 ("로그인" · "저장" · "연결") — "~하지 못했어요"·"~할 수 있어요"에 들어간다
struct AuthFailureBlock<Action: View>: View {

    let failure: AuthFailure
    let verb: String
    @ViewBuilder var action: () -> Action

    var body: some View {
        StatusBlock(tone: .error, message: failure.message(verb: verb), detail: failure.detail, action: action)
    }
}

/// ``AuthFailureBlock``과 예외 화면(``AuthCheckScreen``, KAN-355)이 같이 쓰는 문구.
extension AuthFailure {

    func message(verb: String) -> String {
        switch reason {
        case .retry, .retryLater: return "\(verb)하지 못했어요"
        case .rateLimited: return "잠시 뒤에 \(verb)할 수 있어요"
        case .underAge: return "만 14세 이상만 가입할 수 있어요"
        case .unsupported: return "지금은 \(verb)할 수 없어요"
        case .guestLimitExceeded: return "오늘은 로그인 없이 둘러볼 수 없어요"
        }
    }

    var detail: String? {
        switch reason {
        case .retry: return "네트워크를 확인하고 다시 시도해 주세요"
        case .retryLater: return "잠시 뒤에 다시 시도해 주세요"
        case .rateLimited:
            return retryAfterSeconds.map { "접속이 몰리고 있어요 · \($0)초 뒤에 다시 눌러 주세요" }
                ?? "접속이 몰리고 있어요 · 잠시 뒤에 다시 눌러 주세요"
        case .underAge: return nil
        case .unsupported: return "앱을 최신 버전으로 업데이트한 뒤 다시 열어 주세요"
        // 같은 IP의 하루 상한이다 (KAN-330, 서버 KAN-329). 소셜 로그인은 막히지 않는다. 문구는 안드로이드와 같다(KAN-330 5단계).
        case .guestLimitExceeded: return "로그인해서 이용해 주세요"
        }
    }
}

extension AuthFailureBlock where Action == EmptyView {
    init(failure: AuthFailure, verb: String) {
        self.init(failure: failure, verb: verb, action: { EmptyView() })
    }
}

/// 시작 확인 화면 (KAN-224). 안드로이드 `AuthCheckScreen` 자리다.
///
/// 첫 확인은 런치 화면과 같은 얼굴(크림 + 가운데 아이콘)로 가린다 — 안드로이드가 스플래시를 붙드는 자리다. iOS에는
/// 런치 화면을 붙들 API가 없어, 첫 프레임에 같은 그림을 그려 이어 붙인다. 그래야 로그인된 사용자에게 로그인 화면이
/// 한 번 번쩍이지 않는다. 대기 문구는 [다시 시도] 뒤에만 보인다. 확인이 판정 없이 끝나면
/// (``AccenturyCore/AuthGateState/checkFailed(_:)``) 토큰은 그대로 둔 채 다시 시도만 준다.
struct AuthCheckScreen: View {

    /// nil이면 확인 중이다
    let failure: AuthFailure?
    /// 확인 중일 때 런치 화면 얼굴을 쓸지 — 첫 확인이면 true, [다시 시도] 뒤면 false
    let showsLaunchFace: Bool
    let onRetry: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        // 런치 화면 얼굴에는 앱바를 얹지 않는다 — 런치 화면과 이어 붙이는 것이 목적이라 줄 하나만 달라도 번쩍인다.
        if failure == nil, showsLaunchFace {
            ZStack {
                Papercut.cream.ignoresSafeArea()
                // Info-*.plist UILaunchScreen의 UIImageName과 같은 자산이다.
                Image("LaunchIcon").accessibilityHidden(true)
            }
        } else {
            checkContent.paperAppBar()
        }
    }

    /// 확인 실패·[다시 시도] 뒤 대기 — 워드마크 앱바 아래에 선다 (KAN-288 디자인 3, 안드로이드 `AuthCheckScreen`).
    /// 실패는 예외 화면 서식(``ExceptionScreen``, KAN-355)이다.
    private var checkContent: some View {
        ZStack {
            Papercut.cream.ignoresSafeArea()
            if let failure {
                ExceptionScreen(systemImage: symbol(failure.reason), title: failure.message(verb: "연결"), message: failure.detail) {
                    // 재시도 불가 거절은 업데이트 안내다 (KAN-288 시안 15, 안드로이드 `AuthCheckScreen`) — [업데이트하기]가
                    // App Store를 열고 지금까지의 [다시 시도]는 [나중에]로 남는다. 상품 페이지가 없는 빌드는 예전 그대로다.
                    if failure.reason == .unsupported, let storeURL = AppConfig.appStoreURL {
                        AccenturyButton(text: "업데이트하기") { openURL(storeURL) }
                        AccenturyButton(text: "나중에", variant: .text, action: onRetry)
                    } else {
                        // 시안 s-15 서식대로 주 버튼이다 (KAN-355, 예전에는 보조 버튼).
                        AccenturyButton(text: "다시 시도", leadingIcon: "arrow.clockwise", action: onRetry)
                    }
                }
            } else {
                VStack(spacing: Papercut.space3) {
                    StatusBlock(tone: .waiting, message: "로그인 정보를 확인하고 있어요")
                    ProgressView().progressViewStyle(.circular).tint(Papercut.ink)
                }
                .padding(Papercut.space4)
            }
        }
    }

    /// 아이콘 원의 선화 (KAN-355). 시작 확인에서 나오는 이유는 연결·서버·몰림·업데이트이고, 나머지 둘은 같은 계열에서 골랐다.
    private func symbol(_ reason: AuthFailureReason) -> String {
        switch reason {
        case .retry: return "wifi.slash"
        case .retryLater: return "exclamationmark.circle"
        case .rateLimited: return "hourglass"
        case .unsupported: return "arrow.down.app"
        case .underAge, .guestLimitExceeded: return "person.crop.circle.badge.exclamationmark"
        }
    }
}
