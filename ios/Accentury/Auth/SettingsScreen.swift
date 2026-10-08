import AccenturyCore
import SwiftUI

/// 웹 화면 위에 뜨는 설정 진입 톱니 (KAN-247, 팀 결정 A안). 안드로이드 `auth/SettingsScreen.kt`의
/// `SettingsGearButton` 이식본이다. 웹·브리지를 건드리지 않고 네이티브가 WebView 위에 얹는다 — 진입점을 웹 화면마다
/// 만들면 브리지 계약이 하나 늘고 두 플랫폼이 같이 바뀐다.
///
/// 모양은 크림 원에 톱니만 얹고 테두리·그림자는 없다(테두리는 팀장 요청으로 뺐다, 2026-10-03) — 웹 화면의 주
/// 버튼보다 무게가 앞서면 안 된다. 터치 영역은 ``Papercut/touchTargetMin``(48, HIG 44 이상)이다. 그림은 SF Symbol `gearshape`라 자산을
/// 늘리지 않는다(안드로이드는 같은 그림의 벡터 `outline_settings_24`).
struct SettingsGearButton: View {

    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "gearshape")
                .font(.system(size: 22, weight: .regular))
                .foregroundColor(Papercut.ink)
                .frame(width: Papercut.touchTargetMin, height: Papercut.touchTargetMin)
                .background(Circle().fill(Papercut.cream))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("설정")
    }
}

/// 설정 화면 (KAN-247). 계정 정보, 회원 탈퇴(KAN-251), 음성 저장 동의(KAN-270), 로그아웃. 안드로이드 `auth/SettingsScreen.kt`의 이식본이다.
///
/// ``TestFlowView``를 내리지 않고 **그 위를 덮는다**(``AuthGateView``) — WebView는 인트로부터 테스트 끝까지 한
/// 인스턴스로 살아야 하므로 닫으면 보던 웹 화면 그대로다.
///
/// 계정 값은 게이트가 이미 든 ``AccenturyCore/AuthGateState/signedIn(_:voiceConsent:)``의 사용자를 쓴다 — 로그인·시작 확인 때
/// 서버가 준 값이라 `/v0/users/me`를 또 부를 이유가 없다.
struct SettingsScreen: View {

    let user: AuthUser
    /// ``AccenturyCore/AuthGateState/signedIn(_:voiceConsent:)``의 동의 (KAN-270). nil이면 토글 대신 [다시 시도]를 보인다
    let voiceConsent: VoiceConsent?
    let onClose: () -> Void
    /// ``AccenturyCore/AuthGateController/logout(idpLogout:)``. 끝나면 게이트가 `signedOut`이 되어 이 화면째 로그인
    /// 화면으로 바뀐다.
    let onLogout: () async -> Void
    /// ``AccenturyCore/withdrawAccount(provider:reauthDelay:appleReauth:withdraw:)`` — 애플 계정이면 재인증 뒤
    /// ``AccenturyCore/AuthGateController/withdraw(appleAuthorizationCode:idpLogout:)``. 탈퇴되면 로그아웃과 같이 로그인 화면으로
    /// 바뀌고, 실패하면 로그인 상태 그대로 안내를 남긴다. nil = 사용자가 애플 창에서 취소했다(서버 호출 없음)
    let onWithdraw: () async -> WithdrawOutcome?
    /// ``AccenturyCore/AuthGateController/setVoiceConsent(_:)``
    let onVoiceConsentChange: (Bool) async -> AuthResult<Account>
    /// ``AccenturyCore/AuthGateController/reloadVoiceConsent()``
    let onReloadVoiceConsent: () async -> Void
    /// 방침 문서 (로그인 화면과 같은 호출)
    let onOpenPrivacy: () -> Void

    @State private var confirming = false
    @State private var leaving = false
    @State private var confirmingWithdraw = false
    @State private var withdrawing = false
    /// 확인 창 [탈퇴]를 눌렀고 창이 닫히길 기다리는 중 (KAN-251) — 실제 시작은 ``startWithdraw()``.
    @State private var withdrawPending = false
    @State private var withdrawFailed = false

    private var busy: Bool { leaving || withdrawing }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Papercut.space6) {
                HStack {
                    Text("설정")
                        .papercutType(.title)
                        .foregroundColor(Papercut.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    AccenturyButton(text: "닫기", variant: .text, enabled: !busy, action: onClose)
                }

                VStack(alignment: .leading, spacing: Papercut.space3) {
                    Text("계정")
                        .papercutType(.label)
                        .foregroundColor(Papercut.muted)
                        .accessibilityAddTraits(.isHeader)
                    // 라벨 열 폭을 가장 긴 라벨에 맞추려고 Grid다 (안드로이드는 weight 35 : 65).
                    Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: Papercut.space4, verticalSpacing: Papercut.space3) {
                        // 추가 정보 화면을 지나 signedIn이면 이름·이메일은 늘 있다. 서버 값이 비어 오는 경우만 대비한다.
                        ForEach(
                            [("이름", user.name ?? "-"), ("이메일", user.email ?? "-"), ("로그인 방식", providerName(user.provider))],
                            id: \.0
                        ) { label, value in
                            GridRow {
                                Text(label).papercutType(.bodySmall).foregroundColor(Papercut.muted)
                                Text(value).papercutType(.body).foregroundColor(Papercut.ink)
                            }
                        }
                    }
                    // 계정 섹션 맨 아래 (KAN-251, 팀 결정: 버튼 두 번 — 여기서 한 번, 확인 창의 [탈퇴]에서 한 번 더).
                    // 시스템 알림은 누르면 곧바로 닫혀 진행 중 라벨·실패 안내를 창 안에 둘 수 없다 — 둘 다 이 버튼 자리가
                    // 맡는다(안드로이드는 확인 창 안의 [탈퇴하는 중]·StatusBlock).
                    AccenturyButton(text: withdrawing ? "탈퇴하는 중" : "회원 탈퇴", variant: .text, enabled: !busy) {
                        withdrawFailed = false
                        confirmingWithdraw = true
                    }
                    // 실패는 로그인 상태 그대로다 — 같은 자리에서 다시 누르게 한다.
                    if withdrawFailed {
                        StatusBlock(tone: .error, message: "탈퇴되지 않았어요 · 네트워크를 확인하고 다시 시도해 주세요")
                    }
                }

                VoiceConsentSection(
                    consented: voiceConsent?.consented,
                    onChange: {
                        if case .success = await onVoiceConsentChange($0) { return true }
                        return false
                    },
                    onReload: onReloadVoiceConsent,
                    onOpenPrivacy: onOpenPrivacy
                )

                AccenturyButton(text: "로그아웃", variant: .secondary, enabled: !busy, fillsWidth: true) {
                    confirming = true
                }
            }
            /*
             * 탈퇴 확인 창 (KAN-251). 문구는 개인정보처리방침의 말("탈퇴하시면 지체 없이 파기합니다")과 맞춘다. [탈퇴]에
             * destructive 역할을 주지 않는 것은 로그아웃 확인 창과 같다 — 팔레트의 destructive도 잉크다(design-tokens.md).
             * 로그아웃 알림과 다른 뷰에 단다 — 한 뷰에 `.alert`를 둘 걸면 iOS 버전에 따라 하나만 뜬다.
             */
            .alert("회원 탈퇴할까요?", isPresented: $confirmingWithdraw) {
                Button("취소", role: .cancel) {}
                Button("탈퇴", action: requestWithdraw)
            } message: {
                Text("계정 정보(이메일·이름 등)는 탈퇴하면 지체 없이 파기해요\n테스트 결과는 계정과 분리돼 익명으로 남아요\n탈퇴하면 되돌릴 수 없어요")
            }
            /*
             * 탈퇴는 확인 창이 닫힌 뒤에 시작한다 (KAN-251). 알림 버튼의 액션은 창이 닫히기 전에 돈다("All actions in an
             * alert dismiss the alert after the action runs") — 거기서 곧바로 애플 재인증 시트를 띄우면 닫힘과 겹쳐 실패할 수
             * 있고, 그러면 코드 없이 탈퇴해 애플 revoke가 빠진다. 표시 값이 false로 바뀌는 것을 보고 시작하고, 그래도 남는
             * 애니메이션 겹침은 Core의 ``AccenturyCore/appleReauthDelay``가 맡는다.
             * https://developer.apple.com/documentation/swiftui/view/alert(_:ispresented:actions:message:)-8dvt8
             */
            .onChange(of: confirmingWithdraw) { presented in
                if !presented, withdrawPending { startWithdraw() }
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.vertical, Papercut.space4)
        }
        // 아래 WebView를 완전히 가린다 — 크림 면이 비치는 곳 없이 안전 영역 밖까지 간다 (TestFlowView `body` 주석).
        .background(Papercut.cream.ignoresSafeArea())
        // 시스템 알림이라 버튼을 누르면 곧바로 닫힌다 — 진행 중 막기는 화면의 버튼들이 `busy`로 맡는다.
        .alert("로그아웃할까요?", isPresented: $confirming) {
            Button("취소", role: .cancel) {}
            Button("로그아웃") {
                leaving = true
                Task {
                    await onLogout()
                    leaving = false
                }
            }
        } message: {
            Text("다시 쓰려면 로그인해야 해요")
        }
    }

    private func requestWithdraw() {
        // 지금 세워 [회원 탈퇴]를 막는다 — 창이 닫히길 기다리는 동안과 애플 재인증 창이 떠 있는 동안도 진행 중이다.
        withdrawPending = true
        withdrawing = true
        withdrawFailed = false
    }

    private func startWithdraw() {
        withdrawPending = false
        Task {
            let outcome = await onWithdraw()
            withdrawing = false
            switch outcome {
            case nil:
                // 애플 창에서 취소 — 실패가 아니라 안내 없이 확인 창으로 돌아간다.
                confirmingWithdraw = true
            case .failed?:
                withdrawFailed = true
            case .withdrawn?:
                break // 게이트가 signedOut이 되어 이 화면째 로그인 화면으로 바뀐다.
            }
        }
    }
}

/// 「개인정보」 섹션 — 음성 저장 선택 동의의 유일한 켜고 끄는 자리 (KAN-270, 팀 결정 2026-10-06: 건너뛴 사용자에게
/// 동의 화면을 다시 띄우지 않는다). 안드로이드 `SettingsScreen.kt`의 `VoiceConsentSection` 이식본이다.
///
/// 토글은 서버 값(``AccenturyCore/VoiceConsent/consented``)을 따른다. 누르는 동안만 새 값을 먼저 보여 주고, 실패하면 그
/// 값을 버려 원래 자리로 돌아간 뒤 한 줄 안내를 남긴다. 서버가 받은 값이 아니면 켜진 것처럼 보이면 안 된다.
///
/// 익명 모드(KAN-270 6단계, ``AnonymousSettingsScreen``)도 이 섹션을 쓴다 — 값은 기기 로컬이고 바꾸기는 늘 성공한다.
private struct VoiceConsentSection: View {

    /// 지금 값. nil이면(계정 모드에서 상태를 못 받음) 토글 대신 [다시 시도]
    let consented: Bool?
    /// 새 값을 남긴다. true면 성공
    let onChange: (Bool) async -> Bool
    let onReload: () async -> Void
    let onOpenPrivacy: () -> Void
    /// 토글 아래 안내. 익명 모드는 ``AccenturyCore/voiceConsentSettingCaptionAnonymous``
    var caption: String = voiceConsentSettingCaption

    @State private var pending: Bool?
    @State private var failed = false
    @State private var reloading = false

    var body: some View {
        VStack(alignment: .leading, spacing: Papercut.space3) {
            Text("개인정보")
                .papercutType(.label)
                .foregroundColor(Papercut.muted)
                .accessibilityAddTraits(.isHeader)
            if let consented {
                Toggle(isOn: Binding(get: { pending ?? consented }, set: change)) {
                    Text(voiceConsentSettingLabel).papercutType(.body).foregroundColor(Papercut.ink)
                }
                .tint(Papercut.ink)
                .disabled(pending != nil)
                .frame(minHeight: Papercut.touchTargetMin)
                if failed { StatusBlock(tone: .error, message: "바꾸지 못했어요 · 잠시 후 다시 시도해 주세요") }
            } else {
                HStack {
                    Text(voiceConsentSettingLabel).papercutType(.body).foregroundColor(Papercut.ink)
                    Spacer()
                    Text("상태를 불러오지 못했어요").papercutType(.bodySmall).foregroundColor(Papercut.ink)
                }
                AccenturyButton(text: "다시 시도", variant: .text, enabled: !reloading) {
                    reloading = true
                    Task {
                        await onReload()
                        reloading = false
                    }
                }
            }
            Text(caption)
                .papercutType(.bodySmall)
                .foregroundColor(Papercut.muted)
                .fixedSize(horizontal: false, vertical: true)
            AccenturyButton(text: "개인정보처리방침", variant: .text, action: onOpenPrivacy)
        }
    }

    private func change(_ next: Bool) {
        pending = next
        failed = false
        Task {
            failed = await !onChange(next)
            pending = nil
        }
    }
}

/// 로그인을 끈 빌드(익명 모드)의 설정 화면 (KAN-270 6단계). 안드로이드 `AnonymousSettingsScreen` 이식본이다. 톱니는 그대로
/// 두고 「개인정보」만 남긴다 — 계정 섹션·로그아웃·계정 동의 토글은 없다. 스위치는 ``AccenturyCore/AnonymousVoiceConsentStore``를
/// 바꾸고 다음 세션 생성부터 반영된다. 덮는 방식은 ``SettingsScreen``과 같다(``AnonymousFlowView``).
struct AnonymousSettingsScreen: View {

    let consented: Bool
    let onChange: (Bool) -> Void
    let onOpenPrivacy: () -> Void
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Papercut.space6) {
                HStack {
                    Text("설정")
                        .papercutType(.title)
                        .foregroundColor(Papercut.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    AccenturyButton(text: "닫기", variant: .text, action: onClose)
                }
                // consented가 늘 있어 [다시 시도] 갈래는 닿지 않는다 — onReload는 빈 함수다.
                VoiceConsentSection(
                    consented: consented,
                    onChange: { onChange($0); return true },
                    onReload: {},
                    onOpenPrivacy: onOpenPrivacy,
                    caption: voiceConsentSettingCaptionAnonymous
                )
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.vertical, Papercut.space4)
        }
        .background(Papercut.cream.ignoresSafeArea())
    }
}
