import AccenturyCore
import SwiftUI
import UIKit

/// 로그인 화면 (KAN-224). 인트로(웹)보다 앞에 서는 필수 관문이다. 안드로이드 `auth/LoginScreen.kt`의 이식본이다.
///
/// 버튼은 브랜드 면색 없이 보조 버튼 모양을 쓴다 (2026-09-28 팀장 결정) — 크림·잉크 한 벌 화면에 브랜드 색 넷이 서면
/// 그것만 튄다. 글자만으로는 어느 계정인지 한눈에 읽히지 않아 왼쪽에 공식 로고만 공식 색으로 둔다
/// (docs/wiki/social-login-logos.md). 순서는 구글 → 카카오 → 네이버 → 애플이고 넷 다 같은 크기다 — 애플을 다른
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
    /// [보기] — 방침 문서를 연다
    let onOpenPrivacy: () -> Void

    @StateObject private var state = LoginScreenState()

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
                        VStack(spacing: Papercut.space3) {
                            ForEach(providers, id: \.self) { provider in
                                AccenturyButton(
                                    text: "\(providerLabel(provider))로 계속하기",
                                    variant: .secondary,
                                    enabled: state.buttonsEnabled,
                                    fillsWidth: true,
                                    leading: AnyView(IdpLogo(provider: provider)),
                                    action: { Task { await state.signIn(idp: { await signIn(provider) }, login: onLogin) } }
                                )
                            }
                        }
                        ConsentRow(checked: $state.consented, onOpenPrivacy: onOpenPrivacy)
                    }
                }
                .padding(.horizontal, Papercut.space6)
                .padding(.top, Papercut.screenPaddingTop)
                .padding(.bottom, Papercut.space8)
                .frame(minHeight: geometry.size.height)
            }
        }
        .background(Papercut.cream.ignoresSafeArea())
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
            Button { checked.toggle() } label: {
                HStack(spacing: Papercut.space2) {
                    // 안드로이드 Material 체크박스 자리. 색으로 상태를 알리지 않는 팔레트라 잉크 면 + 크림 체크 한 벌이다.
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(checked ? Papercut.ink : Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(Papercut.ink, lineWidth: Papercut.borderStrong))
                        .overlay {
                            if checked {
                                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundColor(Papercut.cream)
                            }
                        }
                        .frame(width: 20, height: 20)
                        .padding(Papercut.space3)
                    Text("개인정보 수집·이용 동의 (필수)")
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

            AccenturyButton(text: "보기", variant: .text, action: onOpenPrivacy)
        }
    }
}

/// IdP 공식 로고 (KAN-224). 파일은 안드로이드와 같은 공식 배포본에서 옮겼다(Assets.xcassets `Idp*`, 출처는
/// social-login-logos.md). 애플은 SF Symbol `apple.logo`가 애플이 앱에 허락한 그 로고다. 버튼 글자가 이미 제공자를
/// 말하므로 스크린 리더에는 읽히지 않는다.
private struct IdpLogo: View {
    let provider: Provider

    var body: some View {
        Group {
            switch provider {
            // 구글 PNG는 20pt로 박는다. 카카오·네이버는 벡터 자산의 고유 크기(가이드 최소 이상)를 쓴다.
            case .GOOGLE: Image("IdpGoogle").resizable().frame(width: 20, height: 20)
            case .KAKAO: Image("IdpKakao")
            case .NAVER: Image("IdpNaver")
            // HIG: 로고와 글자는 검정(또는 흰색) — 우리 잉크가 그 자리다. 크기는 글자 높이에 맞춘다.
            case .APPLE: Image(systemName: "apple.logo").font(.system(size: 19, weight: .medium)).foregroundColor(Papercut.ink)
            }
        }
        .accessibilityHidden(true)
    }
}

private func providerLabel(_ provider: Provider) -> String {
    switch provider {
    case .GOOGLE: return "Google"
    case .KAKAO: return "카카오"
    case .NAVER: return "네이버"
    case .APPLE: return "Apple"
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
        StatusBlock(tone: .error, message: message, detail: detail, action: action)
    }

    private var message: String {
        switch failure.reason {
        case .retry, .retryLater: return "\(verb)하지 못했어요"
        case .rateLimited: return "잠시 뒤에 \(verb)할 수 있어요"
        case .underAge: return "만 14세 이상만 가입할 수 있어요"
        case .unsupported: return "지금은 \(verb)할 수 없어요"
        }
    }

    private var detail: String? {
        switch failure.reason {
        case .retry: return "네트워크를 확인하고 다시 시도해 주세요"
        case .retryLater: return "잠시 뒤에 다시 시도해 주세요"
        case .rateLimited:
            return failure.retryAfterSeconds.map { "접속이 몰리고 있어요 · \($0)초 뒤에 다시 눌러 주세요" }
                ?? "접속이 몰리고 있어요 · 잠시 뒤에 다시 눌러 주세요"
        case .underAge: return nil
        case .unsupported: return "앱을 최신 버전으로 업데이트한 뒤 다시 열어 주세요"
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

    var body: some View {
        ZStack {
            Papercut.cream.ignoresSafeArea()
            if let failure {
                AuthFailureBlock(failure: failure, verb: "연결") {
                    AccenturyButton(text: "다시 시도", variant: .secondary, action: onRetry)
                }
                .padding(Papercut.space4)
            } else if showsLaunchFace {
                // Info-*.plist UILaunchScreen의 UIImageName과 같은 자산이다.
                Image("LaunchIcon").accessibilityHidden(true)
            } else {
                VStack(spacing: Papercut.space3) {
                    StatusBlock(tone: .waiting, message: "로그인 정보를 확인하고 있어요")
                    ProgressView().progressViewStyle(.circular).tint(Papercut.ink)
                }
                .padding(Papercut.space4)
            }
        }
    }
}
