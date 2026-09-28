import AccenturyCore
import SwiftUI

/// 로그인 관문 (KAN-224). 안드로이드 `MainActivity.AuthGate` 컴포저블의 이식본이다 — 인트로(웹)보다 앞에 서고,
/// 로그인·추가 정보가 끝나야 ``TestFlowView``가 열린다.
///
/// **``TestFlowView``는 ``AccenturyCore/AuthGateState/signedIn(_:)``일 때만 화면에 있다.** 어디서든 Refresh가 거절돼
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
            ProfileScreen(user: user, error: error, onSubmit: { await gate.submitProfile($0) })
                .id(user.id)

        case .signedIn:
            TestFlowView()
        }
    }
}
