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

/// 설정 화면 (KAN-247). 계정 정보와 로그아웃. 안드로이드 `auth/SettingsScreen.kt`의 이식본이다.
///
/// ``TestFlowView``를 내리지 않고 **그 위를 덮는다**(``AuthGateView``) — WebView는 인트로부터 테스트 끝까지 한
/// 인스턴스로 살아야 하므로 닫으면 보던 웹 화면 그대로다.
///
/// 계정 값은 게이트가 이미 든 ``AccenturyCore/AuthGateState/signedIn(_:)``의 사용자를 쓴다 — 로그인·시작 확인 때
/// 서버가 준 값이라 `/v0/users/me`를 또 부를 이유가 없다.
struct SettingsScreen: View {

    let user: AuthUser
    let onClose: () -> Void
    /// ``AccenturyCore/AuthGateController/logout(idpLogout:)``. 끝나면 게이트가 `signedOut`이 되어 이 화면째 로그인
    /// 화면으로 바뀐다.
    let onLogout: () async -> Void

    @State private var confirming = false
    @State private var leaving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Papercut.space6) {
                HStack {
                    Text("설정")
                        .papercutType(.title)
                        .foregroundColor(Papercut.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    AccenturyButton(text: "닫기", variant: .text, enabled: !leaving, action: onClose)
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
                    // [회원 탈퇴]는 KAN-251이 이 자리(계정 섹션 맨 아래)에 붙인다.
                }

                AccenturyButton(text: "로그아웃", variant: .secondary, enabled: !leaving, fillsWidth: true) {
                    confirming = true
                }
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.vertical, Papercut.space4)
        }
        // 아래 WebView를 완전히 가린다 — 크림 면이 비치는 곳 없이 안전 영역 밖까지 간다 (TestFlowView `body` 주석).
        .background(Papercut.cream.ignoresSafeArea())
        // 시스템 알림이라 버튼을 누르면 곧바로 닫힌다 — 진행 중 막기는 화면의 버튼들이 `leaving`으로 맡는다.
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
}
