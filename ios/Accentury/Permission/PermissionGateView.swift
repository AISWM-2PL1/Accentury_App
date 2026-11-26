import AccenturyCore
import SwiftUI

/// 마이크 권한 게이트 (KAN-98의 iOS 이식). 거부하면 테스트를 시작할 수 없다 —
/// 부분 응시 없음 (2026-07-27 확정, FR-AD-01). **이 화면을 권한 없이 닫는 길은 없다** —
/// 건너뛰기 버튼도, 닫기 버튼도, 스와이프로 내릴 수 있는 표현도 두지 않는다.
///
/// 판단 로직은 `AccenturyCore`의 `MicPermissionController`(→ `PermissionGateModel`)에 있고,
/// 여기는 상태별 화면과 iOS 생명주기 결선(`scenePhase` 복귀 재확인)만 담당한다.
///
/// 통과는 ``onGranted``로 알리고 그 뒤 어디로 갈지는 호출자가 정한다 — 안드로이드와 같은
/// 이유다. 같은 게이트를 테스트 시작과 VOICE 문항 진입 두 곳에서 쓰는데 통과 후 할 일이
/// 서로 다르다(테스트 URL 로드 vs 기다리던 문항의 녹음 재개).
///
/// 팔레트(``Papercut``)·간격·계층·서체는 `docs/wiki/design-tokens.md`를 따른다. 토큰은 §6에서
/// `UI/Theme/PapercutTheme.swift`로 옮겼고(같은 값을 쓰는 화면이 넷 늘면서 사본이 파일마다
/// 생길 자리가 됐다), 제목과 버튼 라벨의 Jua는 KAN-178에서 얹었다. 남은 임시는 **잉크 선화
/// 자산**뿐이라 마이크 그림만 아직 SF Symbol이다.
struct PermissionGateView: View {

    @StateObject private var model: PermissionGateModel
    @Environment(\.scenePhase) private var scenePhase

    /// 게이트 통과 통보. 한 번만 부른다.
    private let onGranted: () -> Void

    /// 상태가 바뀔 때마다 부르는 관찰 훅. 스모크 로그가 쓰고, 평소에는 비어 있다.
    private let onStateChange: ((MicPermissionState) -> Void)?

    @MainActor
    init(
        onGranted: @escaping () -> Void,
        onStateChange: ((MicPermissionState) -> Void)? = nil
    ) {
        self.init(model: PermissionGateModel(), onGranted: onGranted, onStateChange: onStateChange)
    }

    /// 모델 주입 경로. 기본 인자로 합치지 않은 이유는 기본 인자 식이 언제나 격리 밖에서
    /// 평가되기 때문이다 — `PermissionGateModel`이 `@MainActor`라 거기서는 만들 수 없다.
    @MainActor
    init(
        model: @autoclosure @escaping () -> PermissionGateModel,
        onGranted: @escaping () -> Void,
        onStateChange: ((MicPermissionState) -> Void)? = nil
    ) {
        _model = StateObject(wrappedValue: model())
        self.onGranted = onGranted
        self.onStateChange = onStateChange
    }

    var body: some View {
        ZStack {
            Papercut.cream.ignoresSafeArea()

            switch model.state {
            case .granted:
                // 통보는 렌더가 아니라 이펙트에서 한다 — onGranted가 상위 상태를 바꿔 이
                // 게이트를 걷어내므로, 그리는 도중에 부르면 그리는 중 상태 변경이 된다.
                // 한 번만 나가는 것은 모델이 보장한다 — 이 이펙트는 화면이 다시 나타나면
                // 다시 돌고, 뷰 값이 다시 만들어지는 것도 여기서는 통제할 수 없다.
                Color.clear.task {
                    if model.consumeGrantedDelivery() { onGranted() }
                }

            case .rationale:
                GateScreen(
                    headline: "발음 분석에 마이크가 필요해요",
                    // KAN-270 — 선택 동의한 사용자에게는 '즉시 삭제'가 사실이 아니다. 웹 PrivacyNotice 정본 문장과 같은 말이다 (KAN-355에서 통일).
                    // KAN-366 — 앞 두 문장은 수신처(자체 서버·외부 AI 미전송). App Store 5.1.1(i) 빌드 17 거절이 녹음 전 수신처 고지를 요구했다.
                    // 안드로이드 MainActivity 마이크 게이트와 같은 문장이다.
                    supporting: "\(voiceRecipientNotice) 따로 동의하지 않으면 녹음한 음성은 분석이 끝나면 바로 지워요",
                    // 「계속 →」이다 (KAN-330, App Store 빌드 15 거절 5.1.1(iv)). 시스템 권한 창 앞의 화면은 설명만 하고, 허용을 우리
                    // 버튼이 말하면 안 된다 — 사용자가 이 화면에서 이미 허용한 것처럼 읽힌다. 허용·거부는 다음에 뜨는 시스템 창이 묻는다.
                    button: GateButton(label: "계속", trailingIcon: "arrow.right", action: .request)
                )

            case .denied:
                // iOS에서는 사실상 도달하지 않는다 (팝업은 설치당 한 번). 안드로이드와 같은
                // 상태 계약을 유지하느라 남겨 둔 화면이라 문구도 정본을 그대로 쓴다.
                GateScreen(
                    headline: "마이크를 허용해야 시작할 수 있어요",
                    // KAN-270 — 선택 동의한 사용자에게는 '즉시 삭제'가 사실이 아니다. 정본 문장은 웹 PrivacyNotice.
                    supporting: "발음을 들어야 분석할 수 있어요 · 음성은 따로 동의한 경우에만 보관돼요",
                    button: GateButton(label: "다시 허용하기", action: .request)
                )

            case .permanentlyDenied:
                GateScreen(
                    headline: "설정에서 마이크를 허용해 주세요",
                    supporting: "권한 창을 더 띄울 수 없어요 · 설정에서 허용하면 이어서 시작할 수 있어요",
                    button: GateButton(label: "설정 열기", leadingIcon: "gearshape", action: .openSettings)
                )
            }
        }
        // 설정 앱에서 허용하고 돌아오면 재시작 없이 통과해야 한다 — 앞으로 나올 때마다
        // 실제 권한을 다시 읽는다 (안드로이드 ON_RESUME 관찰자 자리).
        .onChange(of: scenePhase) { phase in
            if phase == .active { model.onReturnedToApp() }
        }
        // `@Published`의 퍼블리셔는 구독 순간 현재 값부터 흘려주므로, 첫 상태도 여기서 잡힌다.
        .onReceive(model.$state) { onStateChange?($0) }
        #if DEBUG
        // 스모크용. `xcrun simctl`에 좌표 입력이 없어 시뮬레이터에서는 «계속»을 누를
        // 방법이 없다. 설정에서 이미 거부된 상태로 이 인자를 주면 요청이 팝업 없이 곧바로
        // 거절돼(iOS 규칙) 영구 거부 화면까지 자동으로 간다. §5에서 걷으려던 배선인데, 게이트가
        // 이제 웹의 requestMicPermission으로도 열리는 만큼 **자동화가 닿는 유일한 통로**로 남긴다.
        .task {
            guard UserDefaults.standard.bool(forKey: "AutoPermissionRequest") else { return }
            await model.requestPermission()
        }
        #endif
    }

    // MARK: - 화면

    private enum GateAction {
        case request
        case openSettings
    }

    /// 하단 고정 주 버튼 한 개. 시안: 「계속 →」, 영구 거부 [⚙ 설정 열기].
    private struct GateButton {
        let label: String
        var leadingIcon: String?
        var trailingIcon: String?
        let action: GateAction
    }

    /// 예외 화면 서식의 변형 (KAN-355, 시안 s-04): 아이콘 원 112·마이크 56·제목 Jua 30·설명 15 흐린 잉크, 그 아래 쓰임 목록 박스,
    /// 주 버튼은 하단 고정이다. 상단 바는 워드마크만 — 이 화면을 권한 없이 닫는 길은 없다.
    @ViewBuilder
    private func GateScreen(headline: String, supporting: String, button: GateButton) -> some View {
        ExceptionScreen(systemImage: "mic", title: headline, message: supporting, announces: false) {
            assuranceCard
        } footer: {
            // 요청이 도는 동안은 잠근다. 모델도 재진입을 막지만(`requestPermission`), 연타에 반응이 없으면
            // 사용자는 눌리지 않았다고 읽으므로 비활성 면으로 바꿔 「눌렸고 기다리는 중」을 보인다.
            AccenturyButton(
                text: button.label,
                enabled: !model.isRequesting,
                fillsWidth: true,
                leadingIcon: button.leadingIcon,
                trailingIcon: button.trailingIcon
            ) {
                switch button.action {
                case .request: Task { await model.requestPermission() }
                case .openSettings: MicPermission.openSettings()
                }
            }
        }
        // 워드마크 앱바 (KAN-288 디자인 3). 허용된 뒤의 빈 칸(`.granted`)에는 얹지 않는다 — 곧 걷히는 자리다.
        .paperAppBar()
    }

    /// 마이크를 왜 달라는지 세 줄로 답하는 목록 박스 (시안 `.card.p1-benefits`: paper 면·잉크 1·모서리 10·그늘, 줄 사이 8).
    /// 권한 요청 앞에서 사용자가 실제로 궁금해하는 것은 "무엇에 쓰는가"와 "안전한가" 둘이라, 그 답을 버튼보다 먼저 보이는 자리에 둔다.
    private var assuranceCard: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusLG, style: .continuous)
        return VStack(alignment: .leading, spacing: Papercut.space2) {
            ForEach(Self.assurances, id: \.self) { line in
                HStack(spacing: Papercut.space3) {
                    // 줄머리는 잉크 점 하나다 (KAN-161 4단계). 이모지는 잉크 한 색 화면에서 색을 가진 유일한 물건이라 세 줄이 그림 밖으로 튄다.
                    Circle()
                        .fill(Papercut.ink)
                        .frame(width: 5, height: 5)
                    Text(line)
                        .papercutType(.bodySmall)
                        .foregroundColor(Papercut.ink)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
        .padding(.horizontal, Papercut.space4)
        .background(shape.fill(Papercut.paper))
        .overlay(shape.strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline))
        .paperShadow(cornerRadius: Papercut.radiusLG)
    }

    private static let assurances = [
        "실시간 억양 곡선 분석",
        "발음 정확도 점수 측정",
        // KAN-270 — 선택 동의한 사용자에게는 '즉시 삭제'가 사실이 아니다. 정본 문장은 웹 PrivacyNotice.
        "음성은 따로 동의한 경우에만 보관",
    ]
}

#Preview {
    PermissionGateView(onGranted: {})
}
