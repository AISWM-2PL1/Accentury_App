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
/// ``TestFlowView``를 내리지 않고 **그 위를 덮는다**(``AuthGateView``, ``View/settingsCover(isPresented:screen:)``) — WebView는
/// 인트로부터 테스트 끝까지 한 인스턴스로 살아야 하므로 닫으면 보던 웹 화면 그대로다.
///
/// 모양은 KAN-355 시안 s-11-settings 「B 목록형」이다: 머리(왼쪽 「설정」·오른쪽 ✕), 「계정」·「광고」·「개인정보」 묶음, 묶음 아래
/// [로그아웃]·[회원 탈퇴]. 워드마크 앱바와 바닥 고정 버튼은 없다(2026-11-12 결정 「설정 배치」).
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
    /// ``AccenturyCore/AuthGateController/withdraw(appleAuthorizationCode:naverRefreshToken:idpLogout:)``. 탈퇴되면 로그아웃과 같이 로그인 화면으로
    /// 바뀌고, 실패하면 로그인 상태 그대로 안내를 남긴다. nil = 사용자가 애플 창에서 취소했다(서버 호출 없음)
    let onWithdraw: () async -> WithdrawOutcome?
    /// ``AccenturyCore/AuthGateController/setVoiceConsent(_:)``
    let onVoiceConsentChange: (Bool) async -> AuthResult<Account>
    /// ``AccenturyCore/AuthGateController/reloadVoiceConsent()``
    let onReloadVoiceConsent: () async -> Void
    /// 방침 문서 (로그인 화면과 같은 호출)
    let onOpenPrivacy: () -> Void
    /// 지금 광고 동의 시트를 다시 열 수 있나 (PR #60 리뷰). 테스트 진행·시작 게이트 중엔 false라 행이 비활성이다
    let adConsentEnabled: Bool
    /// 「맞춤형 광고 설정」 행 (KAN-315). 호출자가 이 화면을 닫고 웹 홈의 광고 동의 시트를 연다
    let onOpenAdConsent: () -> Void

    @State private var confirming = false
    @State private var leaving = false
    @State private var confirmingWithdraw = false
    @State private var withdrawing = false
    /// 애플 계정이 확인 창 [탈퇴]를 눌렀고 창이 닫히길 기다리는 중 (KAN-251) — 실제 시작은 ``startWithdraw()``.
    @State private var withdrawPending = false
    @State private var withdrawFailed = false

    private var busy: Bool { leaving || withdrawing }

    var body: some View {
        SettingsPage(onClose: onClose, closeEnabled: !busy) {
            SettingsSectionLabel(text: "계정", first: true)
            // 추가 정보 화면을 지나 signedIn이면 이름·이메일은 늘 있다. 서버 값이 비어 오는 경우만 대비한다.
            SettingsRow(icon: "person", label: "이름", value: user.name ?? "-")
            SettingsRow(icon: "envelope", label: "이메일", value: user.email ?? "-", divider: true)
            SettingsRow(icon: "key", label: "로그인 방식", value: providerName(user.provider), divider: true)
            // 계정 묶음 바로 아래 (2026-11-12 결정). 탈퇴는 버튼 두 번이다 — 여기서 한 번, 확인 창의 [탈퇴]에서 한 번 더 (KAN-251).
            VStack(spacing: Papercut.space1) {
                AccenturyButton(text: "로그아웃", variant: .secondary, enabled: !busy, fillsWidth: true,
                                leadingIcon: "rectangle.portrait.and.arrow.right") {
                    confirming = true
                }
                // 애플 계정은 재인증·서버 호출 동안 확인 창이 닫혀 있다 — 그동안의 진행 중 표시는 이 버튼이 맡는다.
                AccenturyButton(text: withdrawing ? "탈퇴하는 중" : "회원 탈퇴", variant: .text, enabled: !busy, fillsWidth: true,
                                leadingIcon: "trash") {
                    withdrawFailed = false
                    confirmingWithdraw = true
                }
            }
            .padding(.top, Papercut.space2)

            AdSection(adConsentEnabled: adConsentEnabled && !busy, adConsentAvailable: adConsentEnabled, onOpenAdConsent: onOpenAdConsent)

            VoiceConsentSection(
                consented: voiceConsent?.consented,
                onChange: {
                    if case .success = await onVoiceConsentChange($0) { return true }
                    return false
                },
                onReload: onReloadVoiceConsent,
                onOpenPrivacy: onOpenPrivacy
            )
        }
        /*
         * 로그아웃 확인 창 (KAN-355 시안 s-11-confirm-logout). 공용 종이 대화상자이고 [로그아웃]은 시안대로 벽돌 채움(주 버튼)이다 —
         * 위험 버튼(벽돌 외곽선)은 [그만두기]·[탈퇴]에만 쓴다(2026-11-16 결정). 누르면 창을 닫고 화면 버튼들이 `busy`로 진행을 막는다
         * (예전 시스템 알림과 같은 순서). 끝나면 게이트가 이 화면째 로그인 화면으로 바꾼다.
         */
        .confirmDialog(isPresented: confirming) {
            ConfirmDialog(
                title: "로그아웃할까요?",
                message: ["다시 쓰려면 로그인해야 해요"],
                cancel: .init(text: "취소") { confirming = false },
                confirm: .init(text: "로그아웃", variant: .primary, leadingIcon: "rectangle.portrait.and.arrow.right") {
                    confirming = false
                    leaving = true
                    Task {
                        await onLogout()
                        leaving = false
                    }
                }
            )
        }
        /*
         * 탈퇴 확인 창 (KAN-251, 모양은 KAN-355 시안 s-11-confirm-withdraw). 문구는 개인정보처리방침의 말("탈퇴하시면 지체 없이
         * 파기합니다")과 맞춘다. [탈퇴]는 벽돌 외곽선 위험 버튼이다(2026-11-16 결정).
         *
         * 시스템 알림과 달리 창이 진행 중 표시·실패 안내를 담을 수 있다(안드로이드 확인 창의 [탈퇴하는 중]·StatusBlock과 같다).
         * 애플 계정만 예외다 — 재인증 시트를 창 위에 겹쳐 띄우면 실패할 수 있어(``startWithdraw()``) 창을 먼저 닫는다.
         */
        .confirmDialog(isPresented: confirmingWithdraw) {
            ConfirmDialog(
                title: "회원 탈퇴할까요?",
                message: [
                    "계정 정보(이메일·이름 등)는 탈퇴하면 지체 없이 파기해요",
                    "테스트 결과는 계정과 분리돼 익명으로 남아요",
                    "탈퇴하면 되돌릴 수 없어요",
                ],
                cancel: .init(text: "취소") { confirmingWithdraw = false },
                confirm: .init(text: withdrawing ? "탈퇴하는 중" : "탈퇴", variant: .destructive, leadingIcon: "trash", action: requestWithdraw),
                inProgress: withdrawing
            ) {
                // 실패는 로그인 상태 그대로다 — 같은 창에서 다시 누르게 한다.
                if withdrawFailed {
                    StatusBlock(tone: .error, message: "탈퇴되지 않았어요 · 네트워크를 확인하고 다시 시도해 주세요")
                }
            }
        }
        /*
         * 애플 계정의 탈퇴는 확인 창이 닫힌 뒤에 시작한다 (KAN-251). 창 위에 재인증 시트를 띄우면 닫힘과 겹쳐 실패할 수 있고, 그러면
         * 코드 없이 탈퇴해 애플 revoke가 빠진다. 표시 값이 false로 바뀌는 것을 보고 시작하고, 그 뒤 남는 닫힘 애니메이션(공용 대화상자
         * ``Papercut/Motion/fast`` 150ms)은 Core의 ``AccenturyCore/appleReauthDelay``(350ms)가 재인증 직전에 기다려 넘긴다.
         */
        .onChange(of: confirmingWithdraw) { presented in
            if !presented, withdrawPending { startWithdraw() }
        }
    }

    private func requestWithdraw() {
        // 지금 세워 두 버튼과 [회원 탈퇴]를 막는다 — 창이 닫히길 기다리는 동안과 애플 재인증 창이 떠 있는 동안도 진행 중이다.
        withdrawing = true
        withdrawFailed = false
        if user.provider == .APPLE {
            withdrawPending = true
            confirmingWithdraw = false
        } else {
            startWithdraw()
        }
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
                confirmingWithdraw = true
            case .withdrawn?:
                break // 게이트가 signedOut이 되어 이 화면째 로그인 화면으로 바뀐다.
            }
        }
    }
}

/// 설정 화면의 틀 (KAN-355 시안 s-11-settings). 머리(왼쪽 「설정」 Jua 26, 오른쪽 48 ✕)는 고정이고 그 아래 목록이 스크롤된다. 좌우 여백 24.
/// 아래 WebView를 완전히 가린다 — 크림 면이 안전 영역 밖까지 간다 (TestFlowView `body` 주석).
private struct SettingsPage<Content: View>: View {

    let onClose: () -> Void
    var closeEnabled: Bool = true
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Text("설정")
                    .papercutType(.headline)
                    .foregroundColor(Papercut.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: Papercut.space2)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundColor(Papercut.ink)
                        .frame(width: Papercut.touchTargetMin, height: Papercut.touchTargetMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!closeEnabled)
                .opacity(closeEnabled ? 1 : Papercut.opacityDisabled)
                .accessibilityLabel("설정 닫기")
            }
            .frame(height: Papercut.settingsHeaderHeight)
            .padding(.horizontal, Papercut.space6)

            ScrollView {
                VStack(alignment: .leading, spacing: 0, content: content)
                    .padding(.horizontal, Papercut.space6)
                    .padding(.top, Papercut.space1)
                    .padding(.bottom, Papercut.space6)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Papercut.cream.ignoresSafeArea())
    }
}

/// 묶음 제목 (「계정」·「광고」·「개인정보」). 흐린 잉크 한 줄이고 머리말로 읽힌다.
private struct SettingsSectionLabel: View {

    let text: String
    var first = false

    var body: some View {
        Text(text)
            .papercutType(.caption)
            .foregroundColor(Papercut.muted)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, first ? 0 : Papercut.space4)
            .padding(.bottom, Papercut.space1)
    }
}

/// 설정 목록의 한 행 (KAN-355 시안 `.row`). 왼쪽 선화 · 라벨 · 오른쪽 값 · 끝 선화. 높이 56(시안, 터치 영역 48 이상)이고
/// `divider`면 위에 paper 그림자 색 1 구분선을 긋는다. `action`이 있으면 행 전체가 버튼이다.
private struct SettingsRow: View {

    let icon: String
    let label: String
    var value: String?
    /// 라벨 아래 흐린 한 줄 (광고 신고의 문의처 주소)
    var detail: String?
    /// 끝 선화 — 꺾쇠(`chevron.right`)·외부 링크
    var trailingIcon: String?
    var divider = false
    var underline = false
    var enabled = true
    var action: (() -> Void)?

    var body: some View {
        Group {
            if let action {
                Button(action: action) { content.contentShape(Rectangle()) }
                    .buttonStyle(.plain)
                    .disabled(!enabled)
                    .opacity(enabled ? 1 : Papercut.opacityDisabled)
            } else {
                content.accessibilityElement(children: .combine)
            }
        }
        .overlay(alignment: .top) {
            if divider { Rectangle().fill(Papercut.paperShadow).frame(height: Papercut.borderHairline) }
        }
    }

    private var content: some View {
        HStack(spacing: Papercut.settingsRowSpacing) {
            SettingsIcon(name: icon)
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .papercutType(.caption)
                    .underline(underline)
                    .foregroundColor(Papercut.ink)
                if let detail {
                    Text(detail).papercutType(.caption).foregroundColor(Papercut.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: Papercut.space2)
            if let value {
                Text(value).papercutType(.caption).foregroundColor(Papercut.muted).multilineTextAlignment(.trailing)
            }
            if let trailingIcon { SettingsIcon(name: trailingIcon, size: 14) }
        }
        .frame(maxWidth: .infinity, minHeight: Papercut.settingsRowHeight)
    }
}

/// 행 앞뒤 선화 (시안 20, 꺾쇠·외부 링크는 14~16). 라벨이 이미 말하므로 읽지 않는다.
private struct SettingsIcon: View {

    let name: String
    var size: CGFloat = Papercut.buttonIconSize

    var body: some View {
        Image(systemName: name)
            .font(.system(size: size - 3, weight: .regular))
            .foregroundColor(Papercut.ink)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// 「광고」 묶음 — 「맞춤형 광고 설정」(로그인 빌드만, ``AdConsentRow``)과 바로 아래 「광고 신고」(``AdReportRow``).
private struct AdSection: View {

    /// nil이면 「맞춤형 광고 설정」 행이 없다(익명 빌드)
    var adConsentEnabled: Bool?
    var adConsentAvailable = false
    var onOpenAdConsent: () -> Void = {}

    var body: some View {
        SettingsSectionLabel(text: "광고")
        if let adConsentEnabled {
            AdConsentRow(enabled: adConsentEnabled, available: adConsentAvailable, action: onOpenAdConsent)
        }
        AdReportRow(divider: adConsentEnabled != nil)
    }
}

/// 「맞춤형 광고 설정」 행 (KAN-315, 팀 결정 2026-11-03). 홈 첫 진입에만 뜨던 웹 광고 동의 시트를 다시 여는 유일한
/// 자리다. 안드로이드 `SettingsScreen.kt`의 `AdConsentRow`와 거울이다 — 「광고」 묶음 첫 행, 행 전체가 버튼이다. 값을 여기서 바꾸지 않고 웹 시트에 맡긴다 — 시트가
/// 정본 UI이고, 고른 값은 브리지 `setAdConsent`로 ``AdsController``에 돌아와 이 행도 따라 바뀐다.
/// 로그인 빌드만이다(익명 ``AnonymousSettingsScreen``에는 없다).
private struct AdConsentRow: View {

    let enabled: Bool
    /// false면(테스트 진행·시작 게이트 중) 값 대신 언제 바꿀 수 있는지를 보인다 — 안드로이드 `adConsentSettingValue`와 같은 문구
    let available: Bool
    let action: () -> Void

    @ObservedObject private var ads = AdsController.shared

    var body: some View {
        SettingsRow(icon: "megaphone", label: "맞춤형 광고 설정", value: value, trailingIcon: "chevron.right",
                    enabled: enabled, action: action)
    }

    private var value: String {
        if !available { return "테스트가 끝난 뒤 바꿀 수 있어요" }
        switch ads.consent {
        case .granted: return "맞춤형 광고 허용"
        case .denied: return "일반 광고만 보기"
        case .unknown: return "아직 고르지 않음"
        }
    }
}

/// 「광고 신고」 행 (KAN-330, App Store 지침 1.2 — 부적절한 콘텐츠를 신고할 수단). 회원·게스트·익명 설정에 같이 선다. 메일 작성으로
/// 문의처에 보낸다(``AccenturyCore/adReportMailURL(appVersion:)``) — 광고는 AdMob이 고르므로 받은 신고는 AdMob 광고 검토 센터에서 막는다.
/// 메일 앱이 없으면 `mailto:`가 열리지 않으니 라벨 아래에 주소를 그대로 보인다.
private struct AdReportRow: View {

    var divider = false

    @Environment(\.openURL) private var openURL

    var body: some View {
        SettingsRow(icon: "flag", label: "광고 신고", detail: "부적절한 광고를 \(supportEmail)로 알려 주세요",
                    trailingIcon: "chevron.right", divider: divider) {
            let info = Bundle.main.infoDictionary
            let version = "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
            if let url = adReportMailURL(appVersion: version) { openURL(url) }
        }
    }
}

/// 게스트의 설정 화면 (KAN-330, 「로그인 없이 둘러보기」). 계정 묶음·로그아웃·회원 탈퇴 대신 안내와 [로그인] 하나다 — 게스트 계정은 앱 안에서
/// 되찾을 길이 없어 탈퇴를 두지 않고, 서버가 30일 미사용 게스트를 자동 파기한다(서버 privacy-policy.md 「게스트 계정 (앱)」). 음성 저장
/// 동의는 계정 값이 아니라 익명 빌드와 같은 기기 로컬 값이다(``AnonymousSettingsScreen``과 같은 묶음) — 게스트 레벨 테스트가 익명 세션이라서다
/// (PR #70 리뷰, 안드로이드 게스트 설정과 같다). 광고는 게스트에게도 나오므로 「광고」 묶음이 회원과 같다. 서식은 회원 설정과 같은 목록형이다
/// (2026-11-16 결정).
struct GuestSettingsScreen: View {

    /// ``AccenturyCore/AnonymousVoiceConsentStore``의 지금 값
    let consented: Bool
    let onConsentChange: (Bool) -> Void
    let onClose: () -> Void
    /// ``AccenturyCore/AuthGateController/leaveGuest()``. 끝나면 게이트가 `signedOut`이 되어 이 화면째 로그인 화면으로 바뀐다
    let onLogin: () async -> Void
    let onOpenPrivacy: () -> Void
    let adConsentEnabled: Bool
    let onOpenAdConsent: () -> Void

    @State private var leaving = false

    var body: some View {
        SettingsPage(onClose: onClose, closeEnabled: !leaving) {
            SettingsSectionLabel(text: "계정", first: true)
            Text("로그인하면 억양 학습과 단어 학습 기록을 남길 수 있어요")
                .papercutType(.caption)
                .foregroundColor(Papercut.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: Papercut.touchTargetMin, alignment: .leading)
            AccenturyButton(text: leaving ? "이동하는 중" : "로그인", enabled: !leaving, fillsWidth: true) {
                leaving = true
                Task {
                    await onLogin()
                    leaving = false
                }
            }
            .padding(.top, Papercut.space2)

            AdSection(adConsentEnabled: adConsentEnabled && !leaving, adConsentAvailable: adConsentEnabled, onOpenAdConsent: onOpenAdConsent)

            // consented가 늘 있어 [다시 시도] 갈래는 닿지 않는다 — onReload는 빈 함수다(``AnonymousSettingsScreen``과 같다).
            VoiceConsentSection(
                consented: consented,
                onChange: { onConsentChange($0); return true },
                onReload: {},
                onOpenPrivacy: onOpenPrivacy,
                caption: voiceConsentSettingCaptionAnonymous
            )
        }
    }
}

/// 「개인정보」 묶음 — 음성 저장 선택 동의의 유일한 켜고 끄는 자리 (KAN-270, 팀 결정 2026-10-06: 건너뛴 사용자에게
/// 동의 화면을 다시 띄우지 않는다)와 「개인정보처리방침」 행. 안드로이드 `SettingsScreen.kt`의 `VoiceConsentSection` 이식본이다.
///
/// 토글은 서버 값(``AccenturyCore/VoiceConsent/consented``)을 따른다. 누르는 동안만 새 값을 먼저 보여 주고, 실패하면 그
/// 값을 버려 원래 자리로 돌아간 뒤 한 줄 안내를 남긴다. 서버가 받은 값이 아니면 켜진 것처럼 보이면 안 된다.
///
/// 익명 모드(KAN-270 6단계, ``AnonymousSettingsScreen``)도 이 묶음을 쓴다 — 값은 기기 로컬이고 바꾸기는 늘 성공한다.
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
        SettingsSectionLabel(text: "개인정보")
        if let consented {
            Toggle(isOn: Binding(get: { pending ?? consented }, set: change)) {
                Text(voiceConsentSettingLabel).papercutType(.caption).foregroundColor(Papercut.ink)
            }
            .toggleStyle(PaperSwitchStyle())
            .disabled(pending != nil)
            if failed { StatusBlock(tone: .error, message: "바꾸지 못했어요 · 잠시 후 다시 시도해 주세요") }
        } else {
            SettingsRow(icon: "mic", label: voiceConsentSettingLabel, value: "상태를 불러오지 못했어요")
            AccenturyButton(text: "다시 시도", variant: .text, enabled: !reloading) {
                reloading = true
                Task {
                    await onReload()
                    reloading = false
                }
            }
        }
        Text(caption)
            .papercutType(.caption)
            .foregroundColor(Papercut.muted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, Papercut.space2)
        SettingsRow(icon: "checkmark.shield", label: "개인정보처리방침", trailingIcon: "arrow.up.right.square",
                    divider: true, underline: true, action: onOpenPrivacy)
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

/// 설정의 스위치 행 (KAN-355 시안 `.voice`·`.switch`). 마이크 선화 · 라벨 · 오른쪽 네모 스위치(38×24, 모서리 4, 잉크 테두리). 꺼지면
/// paper 면에 잉크 손잡이가 왼쪽, 켜지면 벽돌 면에 paper 손잡이가 오른쪽이고 체크가 선다. 행 전체가 눌리고, 스위치는 상태를 말로 읽는다
/// (iOS 16에는 스위치 특성 `.isToggle`이 없어 값 「켬」·「끔」을 직접 단다).
private struct PaperSwitchStyle: ToggleStyle {

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: Papercut.settingsRowSpacing) {
                SettingsIcon(name: "mic")
                configuration.label
                Spacer(minLength: Papercut.space2)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    RoundedRectangle(cornerRadius: Papercut.radiusSM)
                        .fill(configuration.isOn ? Papercut.point : Papercut.paper)
                    RoundedRectangle(cornerRadius: Papercut.radiusSM)
                        .strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline)
                    if configuration.isOn {
                        Image(systemName: "checkmark")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(Papercut.paper)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, 4)
                    }
                    RoundedRectangle(cornerRadius: 2)
                        .fill(configuration.isOn ? Papercut.paper : Papercut.ink)
                        .frame(width: 16, height: 16)
                        .padding(.horizontal, 3)
                }
                .frame(width: 38, height: 24)
                .frame(width: Papercut.touchTargetMin, height: Papercut.touchTargetMin)
            }
            .frame(maxWidth: .infinity, minHeight: Papercut.settingsRowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : Papercut.opacityDisabled)
        .accessibilityValue(configuration.isOn ? "켬" : "끔")
    }
}

/// 로그인을 끈 빌드(익명 모드)의 설정 화면 (KAN-270 6단계). 안드로이드 `AnonymousSettingsScreen` 이식본이다. 톱니는 그대로
/// 두고 「광고」(신고만)와 「개인정보」만 남긴다 — 계정 묶음·로그아웃·계정 동의 토글은 없다. 스위치는 ``AccenturyCore/AnonymousVoiceConsentStore``를
/// 바꾸고 다음 세션 생성부터 반영된다. 덮는 방식은 ``SettingsScreen``과 같다(``AnonymousFlowView``). 서식은 회원 설정과 같은 목록형이다
/// (2026-11-16 결정).
struct AnonymousSettingsScreen: View {

    let consented: Bool
    let onChange: (Bool) -> Void
    let onOpenPrivacy: () -> Void
    let onClose: () -> Void

    var body: some View {
        SettingsPage(onClose: onClose) {
            // 광고는 익명 빌드에도 나온다 — 신고 수단은 안드로이드 익명 설정처럼 둔다 (KAN-344, KAN-330 5단계). 첫 묶음이라 위 여백이 없다.
            SettingsSectionLabel(text: "광고", first: true)
            AdReportRow()
            // consented가 늘 있어 [다시 시도] 갈래는 닿지 않는다 — onReload는 빈 함수다.
            VoiceConsentSection(
                consented: consented,
                onChange: { onChange($0); return true },
                onReload: {},
                onOpenPrivacy: onOpenPrivacy,
                caption: voiceConsentSettingCaptionAnonymous
            )
        }
    }
}

extension View {
    /// 설정 화면을 이 화면 위에 덮는다 (KAN-355). 덮개와 같이 300ms(``Papercut/Motion/base``) 페이드로 들고 난다. 동작 줄이기면
    /// 전환 없이 바로 바뀐다. 닫을 때 걷히는 것은 덮개뿐이라 아래 웹 화면은 그대로다.
    func settingsCover<Screen: View>(isPresented: Bool, @ViewBuilder screen: @escaping () -> Screen) -> some View {
        modifier(SettingsCover(isPresented: isPresented, screen: screen))
    }
}

private struct SettingsCover<Screen: View>: ViewModifier {

    let isPresented: Bool
    let screen: () -> Screen

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                if isPresented {
                    screen().transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.base), value: isPresented)
    }
}
