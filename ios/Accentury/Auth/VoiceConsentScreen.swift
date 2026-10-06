import AccenturyCore
import SwiftUI

/// 음성 저장 선택 동의 화면 (KAN-270 3단계, 서버 KAN-269). 안드로이드 `auth/VoiceConsentScreen.kt`의 이식본이다.
/// 로그인과 추가 정보를 마친 미동의 계정에 한 번 뜬다 — 띄울지는 ``AccenturyCore/shouldPromptVoiceConsent(state:wasPrompted:)``가,
/// 다시 안 띄우는 기억은 ``AccenturyCore/UserDefaultsVoiceConsentPromptStore``가 맡는다.
///
/// 웹 화면(`VoiceConsentScreen.tsx`)과 달리 버튼이 둘이다. 웹은 세션마다 묻고 미체크 [다음]이 거부지만, 앱은 계정에
/// 한 번 묻고 끝나므로 [건너뛰기]가 "이번에 안 한다"를 분명히 말해야 한다. [동의하고 계속]은 체크해야 켜진다 —
/// 만 14세 확인이 체크박스 문장에 묶여 있다.
///
/// 체크 칸은 `Toggle`이 아니라 로그인 화면 필수 동의 줄과 같은 ``ConsentCheckMark`` 버튼이다. iOS `Toggle`은 스위치로
/// 그려져 "문장에 동의한다"는 체크박스의 뜻이 흐려지고, 같은 앱 안에서 동의 칸이 두 모양이 되면 안 된다. 스크린 리더에는
/// 줄 전체가 한 요소로 읽히고 체크하면 "선택됨"이 붙는다(로그인 `ConsentRow`와 같은 접근성 구성).
///
/// 설정 화면처럼 ``TestFlowView`` 위에 덮인다(호출자 `SignedInScreen`).
///
/// 로그인을 끈 빌드(익명 모드, 6단계)는 시작 게이트의 마이크 권한 뒤에서 설치당 한 번 같은 화면을 띄운다
/// (``TestFlowView`` 오버레이) — 선택은 ``AccenturyCore/AnonymousVoiceConsentStore``에 남고, 문안은 ``details``로 셋째
/// 줄부터 웹처럼 바꾼다.
struct VoiceConsentScreen: View {

    /// 동의를 남긴다. true면 성공 — 계정 모드는 ``AccenturyCore/AuthGateController/setVoiceConsent(_:)`` `true`가
    /// 성공했는가, 익명 모드는 늘 true. 성공하면 호출자가 화면을 걷고, 실패면 한 줄 안내를 남긴다
    let onConsent: () async -> Bool
    /// 표시 기록만 남기고 걷는다. 서버에 보낼 것이 없다(건너뜀 = 미동의)
    let onSkip: () -> Void
    /// 방침 문서 (로그인 화면과 같은 호출)
    let onOpenPrivacy: () -> Void
    /// 보관 항목·기간·철회 줄. 익명 모드는 ``AccenturyCore/voiceConsentDetailsAnonymous``
    var details: [String] = voiceConsentDetails

    @State private var checked = false
    @State private var submitting = false
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Papercut.space6) {
                Text(voiceConsentTitle)
                    .papercutType(.headline)
                    .foregroundColor(Papercut.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(voiceConsentLead)
                    .papercutType(.body)
                    .foregroundColor(Papercut.ink)

                Button { checked.toggle() } label: {
                    HStack(spacing: Papercut.space2) {
                        ConsentCheckMark(checked: checked)
                        Text(voiceConsentCheckboxLabel)
                            .papercutType(.bodySmall)
                            .foregroundColor(Papercut.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: Papercut.touchTargetMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(submitting)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(checked ? .isSelected : [])

                VStack(alignment: .leading, spacing: Papercut.space2) {
                    ForEach(details, id: \.self) { line in
                        Text("· \(line)").papercutType(.bodySmall).foregroundColor(Papercut.muted)
                    }
                    Text("\(voiceConsentPolicyLead) 개인정보처리방침\(voiceConsentPolicyTail)")
                        .papercutType(.bodySmall)
                        .foregroundColor(Papercut.muted)
                    AccenturyButton(text: "개인정보처리방침", variant: .text, action: onOpenPrivacy)
                }

                if failed { StatusBlock(tone: .error, message: "잠시 후 다시 시도해 주세요") }

                AccenturyButton(text: "동의하고 계속", enabled: checked && !submitting, fillsWidth: true) {
                    submitting = true
                    Task {
                        failed = await !onConsent()
                        submitting = false
                    }
                }
                AccenturyButton(text: "건너뛰기", variant: .text, fillsWidth: true, action: onSkip)
                Text(voiceConsentFootnote)
                    .papercutType(.caption)
                    .foregroundColor(Papercut.muted)
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.top, Papercut.screenPaddingTop)
            .padding(.bottom, Papercut.space8)
        }
        // 아래 WebView를 완전히 가린다 (SettingsScreen과 같다).
        .background(Papercut.cream.ignoresSafeArea())
    }
}
