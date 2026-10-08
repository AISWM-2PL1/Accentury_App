import AccenturyCore
import SwiftUI

/// 로그인 관문 (KAN-224). 안드로이드 `MainActivity.AuthGate` 컴포저블의 이식본이다 — 인트로(웹)보다 앞에 서고,
/// 로그인·추가 정보가 끝나야 ``TestFlowView``가 열린다.
///
/// **``TestFlowView``는 ``AccenturyCore/AuthGateState/signedIn(_:voiceConsent:)``일 때만 화면에 있다.** 어디서든 Refresh가 거절돼
/// 로그인 화면으로 돌아가면(또는 프로필 미완료로 추가 정보 화면으로 가면) 흐름 화면이 통째로 내려가고, 저장해 둔 시작
/// 게이트·세션도 지운다(``TestFlowModel/clearSavedState(in:)``) — 다시 들어오면 인트로부터다. 진행 중이던 응시를 다른
/// 계정 상태로 이어 가지 않는 것이 이 구조의 요점이다.
struct AuthGateView: View {

    @ObservedObject private var gate = AuthHub.gate

    /// 첫 확인이 끝났는가. 그 전의 확인 중은 런치 화면 얼굴로, [다시 시도] 뒤의 확인 중은 대기 문구로 보인다.
    @State private var checkedOnce = false

    var body: some View {
        content
            .onChange(of: gate.state) { state in
                if state != .checking { checkedOnce = true }
                switch state {
                case .signedOut, .needsProfile: TestFlowModel.clearSavedState()
                case .checking, .checkFailed, .signedIn: break
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch gate.state {
        case .checking:
            AuthCheckScreen(failure: nil, showsLaunchFace: !checkedOnce, onRetry: {})

        case .checkFailed(let failure):
            AuthCheckScreen(failure: failure, showsLaunchFace: false, onRetry: { Task { await gate.bootstrap() } })

        case .signedOut(let error):
            LoginScreen(
                error: error,
                providers: visibleProviders(configured: configuredProviders(), fakeIdp: AppConfig.fakeIdp),
                signIn: { await idpSignIn($0) },
                onLogin: { await gate.login($0, privacyPolicyVersion: AccenturyCore.privacyPolicyVersion) },
                onOpenPrivacy: { ExternalBrowser.open(privacyPolicyURL) }
            )

        case .needsProfile(let user, let error):
            // 계정이 바뀌면(다른 계정으로 다시 로그인) 앞 계정의 입력을 물려받지 않는다.
            ProfileScreen(
                user: user,
                error: error,
                onSubmit: { await gate.submitProfile($0) },
                onSwitchAccount: { await gate.logout { await IdpLogout.all() } }
            )
                .id(user.id)

        case .signedIn(let user, let voiceConsent):
            SignedInScreen(user: user, voiceConsent: voiceConsent, gate: gate)
        }
    }
}

/// 로그인된 동안의 화면 — 흐름 화면과 그 위에 덮이는 설정 화면(KAN-247)·음성 저장 동의 화면(KAN-270). 안드로이드 `AuthGate`의
/// `is AuthGateState.SignedIn -> { ... }` 분기 자리다.
///
/// 설정 화면은 ``TestFlowView``를 내리지 않고 위에 덮는다 — WebView는 한 인스턴스로 살아야 한다(TestFlowView 주석).
/// `fullScreenCover`가 아니라 `ZStack`인 이유도 같다: 덮는 동안 흐름 화면이 화면에서 내려간 것으로 치지 않게.
/// 열림 상태를 이 뷰에 두어 로그아웃으로 `signedIn`을 벗어나면 함께 버려진다 — 다음 로그인이 설정 화면부터 열리지 않는다.
private struct SignedInScreen: View {

    let user: AuthUser
    let voiceConsent: VoiceConsent?
    let gate: AuthGateController

    @State private var settingsOpen = false

    /// 음성 저장 선택 동의 (KAN-270). 설정 화면과 같은 이유로 TestFlowView 위에 덮는다. 로그인·추가 정보를 마친 미동의
    /// 계정에 한 번만 — 건너뛰어도 다시 띄우지 않는다(팀 결정 2026-10-06). 표시 기록은 계정 id별 로컬 플래그이고,
    /// 이 값은 기록을 남긴 그 순간 화면을 걷으려는 것이다(UserDefaults 읽기는 상태가 아니라 다시 그리기를 부르지 않는다).
    @State private var consentPromptDone = false
    private let promptStore = UserDefaultsVoiceConsentPromptStore()

    private var consentShown: Bool {
        !consentPromptDone && shouldPromptVoiceConsent(
            state: .signedIn(user, voiceConsent: voiceConsent),
            wasPrompted: promptStore.wasPrompted(userId: user.id)
        )
    }

    var body: some View {
        let consentShown = consentShown
        ZStack {
            TestFlowView(onOpenSettings: { settingsOpen = true })
                // 덮인 동안 스크린 리더가 아래 웹 화면으로 내려가지 않게 한다.
                .accessibilityHidden(settingsOpen || consentShown)
            if consentShown {
                VoiceConsentScreen(
                    onConsent: {
                        guard case .success = await gate.setVoiceConsent(true) else { return false }
                        finishConsentPrompt()
                        return true
                    },
                    onSkip: finishConsentPrompt,
                    onOpenPrivacy: openPrivacy
                )
                .accessibilityHidden(settingsOpen)
            }
            if settingsOpen {
                SettingsScreen(
                    user: user,
                    voiceConsent: voiceConsent,
                    onClose: { settingsOpen = false },
                    // 추가 정보 화면의 [다른 계정으로 로그인]과 같은 호출이다 — IdP SDK 세션까지 정리해야 다음 로그인에서
                    // 계정을 다시 고를 수 있다.
                    onLogout: { await gate.logout { await IdpLogout.all() } },
                    // 탈퇴도 IdP SDK 세션까지 정리한다 (KAN-251). 애플 계정만 탈퇴 직전에 재인증해 revoke용 코드를 싣는다.
                    onWithdraw: {
                        await withdrawAccount(provider: user.provider, appleReauth: appleReauthorization) { code in
                            await gate.withdraw(appleAuthorizationCode: code) { await IdpLogout.all() }
                        }
                    },
                    // 설정에서 바꾼 것도 '물어봤다'로 친다 — 다른 기기에서 동의한 계정이 여기서 끄자마자 동의 화면이
                    // 뜨던 문제(PR #22 리뷰).
                    onVoiceConsentChange: {
                        let result = await gate.setVoiceConsent($0)
                        if case .success = result { finishConsentPrompt() }
                        return result
                    },
                    onReloadVoiceConsent: { await gate.reloadVoiceConsent() },
                    onOpenPrivacy: openPrivacy
                )
            }
        }
    }

    private func finishConsentPrompt() {
        promptStore.markPrompted(userId: user.id)
        consentPromptDone = true
    }

    private func openPrivacy() {
        ExternalBrowser.open(privacyPolicyURL)
    }
}

/// 로그인을 끈 빌드(익명 모드)의 최상위 (KAN-270 6단계, `AppConfig.loginEnabled == false`). 안드로이드 `MainActivity.AnonymousFlow`
/// 이식본이고 ``AuthGateView`` 자리에 선다(``ContentView``).
///
/// 관문·추가 정보·계정 동의 오버레이가 없고, 음성 저장 동의는 ``TestFlowView``의 시작 게이트가 설치당 한 번 묻는다.
/// 설정 톱니는 그대로이고 ``AnonymousSettingsScreen``(「개인정보」만)을 덮는다 — ``SignedInScreen``과 같은 `ZStack` 구조다.
///
/// 세션 생성은 plain 클라이언트다(``TestFlowModel``의 기본 클라이언트가 `AppConfig.loginEnabled`를 본다). 예전 로그인 빌드가
/// 남긴 토큰이 Keychain에 있어도 Bearer가 실리지 않게 하려는 것이다 — 실리면 서버가 계정 세션으로 보고 voiceConsentVersion을
/// 무시한다.
struct AnonymousFlowView: View {

    @StateObject private var consentStore = AnonymousVoiceConsentStore()
    @State private var settingsOpen = false

    var body: some View {
        ZStack {
            TestFlowView(anonymousConsent: consentStore, onOpenSettings: { settingsOpen = true })
                .accessibilityHidden(settingsOpen)
            if settingsOpen {
                AnonymousSettingsScreen(
                    consented: consentStore.consented(),
                    onChange: { consentStore.save(consented: $0) },
                    onOpenPrivacy: { ExternalBrowser.open(privacyPolicyURL) },
                    onClose: { settingsOpen = false }
                )
            }
        }
    }
}
