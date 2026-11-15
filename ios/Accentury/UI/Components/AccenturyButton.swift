import SwiftUI

/// 버튼 무게 (KAN-148, ``destructive``는 KAN-355). 안드로이드 `ButtonVariant`와 같은 넷이다.
///
/// - ``primary`` 주동작 (녹음 시작·다음·허용). 화면에서 유일하게 벽돌로 꽉 찬 면이고 그림자가 있다
/// - ``secondary`` 보조 (재녹음·재시도·취소). 크림 면에 잉크 1 테두리, 그림자 없음
/// - ``destructive`` 위험한 확인 ([그만두기]·[탈퇴], 2026-11-16 결정). 크림 면에 벽돌 1.5 테두리·벽돌 글자 —
///   채움이 아니라 외곽선이라 주동작보다 무게가 앞서지 않는다
/// - ``text`` 이탈·복귀. 눌리면 안 되는 쪽이라 무게를 가장 뺀다
enum ButtonVariant {
    case primary
    case secondary
    case destructive
    case text
}

/// 버튼 한 상태의 색 (KAN-355). 변형·활성 여부만으로 정해지는 값이라 화면이 아니라 여기서 한 번 정한다.
struct PaperButtonAppearance: Equatable {
    let face: Color
    let border: Color
    let borderWidth: CGFloat
    let label: Color
    let castsShadow: Bool
}

extension ButtonVariant {

    /// 시안 `.btn--*` 값. 비활성은 불투명도가 아니라 **종이 그림자 면 + 흐린 잉크 글자·테두리**다 (시안 `.btn--primary:disabled`) —
    /// 면이 있는 세 변형이 같은 비활성 모양을 쓴다. 글자 버튼은 면이 없어 흐린 잉크 글자 그대로이고, 비활성 흐림은
    /// ``AccenturyButton``이 ``Papercut/opacityDisabled``로 따로 준다.
    func appearance(enabled: Bool) -> PaperButtonAppearance {
        if !enabled, self != .text {
            return PaperButtonAppearance(
                face: Papercut.paperShadow, border: Papercut.muted, borderWidth: Papercut.borderHairline,
                label: Papercut.muted, castsShadow: false
            )
        }
        switch self {
        case .primary:
            return PaperButtonAppearance(
                face: Papercut.point, border: Papercut.point, borderWidth: Papercut.borderHairline,
                label: Papercut.cream, castsShadow: true
            )
        case .secondary:
            return PaperButtonAppearance(
                face: Papercut.cream, border: Papercut.ink, borderWidth: Papercut.borderHairline,
                label: Papercut.ink, castsShadow: false
            )
        case .destructive:
            return PaperButtonAppearance(
                face: Papercut.cream, border: Papercut.point, borderWidth: Papercut.borderRegular,
                label: Papercut.point, castsShadow: false
            )
        case .text:
            return PaperButtonAppearance(
                face: .clear, border: .clear, borderWidth: 0, label: Papercut.muted, castsShadow: false
            )
        }
    }
}

/// 공통 버튼 (KAN-148, 형태는 KAN-161 2단계, 값은 KAN-355). 안드로이드 `ui/components/AccenturyButton.kt`의
/// 이식본이고 웹의 `.btn`과 같은 모양·같은 값이다 — 두 런타임이 한 테스트 안에서 번갈아
/// 나오므로 버튼이 서로 다르게 생기면 바로 보인다.
///
/// 라벨은 Jua다: 주·보조·위험 17, 글자 버튼 16 (2026-11-12 결정). 높이는 모두 48이다.
///
/// 오려 낸 종이다: 오른쪽·아래로 어긋난 자리에 ``View/paperShadow(cornerRadius:visible:)``가
/// 단색 면 한 겹을 깔아 종이가 떠 있는 것처럼 보이고, 누르면 본체가 정확히 그만큼 내려가
/// 그림자를 덮는다 — 종이가 바닥에 닿는 순간이다. 총 차지 높이는 눌림 전후로 같아서 옆
/// 요소가 밀리지 않는다.
///
/// 그림자는 주 버튼에만 있다. 그림자는 "떠 있다"는 뜻이라 화면에 떠 있는 종이가 둘이면 어느
/// 쪽을 눌러야 하는지가 흐려진다. 보조·위험 버튼은 자리만 같게 비우고(눌림 거리가 같다) 그림자를
/// 그리지 않는다.
///
/// 눌림을 제스처가 아니라 ``PapercutButtonStyle``로 받는다 — `Button`의 의미론(스크린 리더의
/// "버튼", 활성화)을 그대로 두면서 `isPressed`만 빌려 쓰는 자리가 그것이다. 제스처로 직접
/// 받으면 VoiceOver가 이 요소를 눌러 줄 방법이 사라진다.
struct AccenturyButton: View {

    let text: String
    var variant: ButtonVariant = .primary
    var enabled: Bool = true
    /// 폭을 늘려 잡을지. 안드로이드가 호출부에서 `Modifier.weight(1f)`/`fillMaxWidth()`로
    /// 정하던 자리다 — 검토 화면의 [재녹음]·[다음]이 같은 폭을 갖는 규칙이 여기 걸린다.
    var fillsWidth: Bool = false
    /// 라벨 바로 앞에 붙는 선화 (SF Symbol 이름, KAN-355). 시안의 「다시 시도」 새로고침·「탈퇴」 휴지통 자리다.
    var leadingIcon: String?
    /// 라벨 바로 뒤에 붙는 선화 (SF Symbol 이름, KAN-355). 시안의 「다음 →」·「계속」 화살표 자리다.
    var trailingIcon: String?
    /// 라벨 왼쪽 끝에 붙는 그림 (KAN-224 IdP 로고). 라벨은 버튼 가운데 그대로다 — 안드로이드 `leading` 자리.
    /// 버튼 본체(라벨) 안에 그려야 눌림을 로고도 같이 탄다.
    var leading: AnyView?
    let action: () -> Void

    var body: some View {
        let look = variant.appearance(enabled: enabled)
        switch variant {
        case .text:
            Button(action: action) {
                label(look, style: .textButton)
                    .frame(maxWidth: fillsWidth ? .infinity : nil)
                    .frame(minHeight: Papercut.touchTargetMin)
                    .padding(.horizontal, Papercut.space3)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PaperTextButtonStyle(underline: look.label))
            .disabled(!enabled)
            .opacity(enabled ? 1 : Papercut.opacityDisabled)

        case .primary, .secondary, .destructive:
            // 주동작에만 가벼운 탭 (KAN-258 B안). 햅틱은 아껴 써야 뜻이 남아서 보조·위험·텍스트 버튼은 떨지 않는다.
            Button(action: variant == .primary ? { HapticPlayer.play(.tap); action() } : action) {
                label(look, style: .button)
                    .frame(maxWidth: leading == nil ? nil : .infinity)
                    .overlay(alignment: .leading) { leading }
            }
            .buttonStyle(PapercutButtonStyle(
                appearance: look,
                minHeight: variant == .primary ? Papercut.controlHeightLarge : Papercut.touchTargetMin,
                fillsWidth: fillsWidth
            ))
            .disabled(!enabled)
        }
    }

    /// 앞 선화 · 라벨 · 뒤 선화 (시안 `.btn`의 `gap: 8`). 선화는 라벨과 같은 색이고 라벨이 이미 말하므로 읽지 않는다.
    private func label(_ look: PaperButtonAppearance, style: Papercut.TextStyle) -> some View {
        HStack(spacing: Papercut.space2) {
            if let leadingIcon { icon(leadingIcon) }
            Text(text).papercutType(style)
            if let trailingIcon { icon(trailingIcon) }
        }
        .foregroundColor(look.label)
    }

    private func icon(_ systemName: String) -> some View {
        // SF Symbol은 글자 크기보다 조금 크게 그려져서 상자(20)보다 작은 글자 크기를 준다.
        Image(systemName: systemName)
            .font(.system(size: Papercut.buttonIconSize - 3, weight: .regular))
            .frame(width: Papercut.buttonIconSize, height: Papercut.buttonIconSize)
            .accessibilityHidden(true)
    }
}

/// 종이 버튼의 면·테두리·눌림. 라벨은 호출자가 그리고 여기는 그 라벨을 감싸는 종이만 그린다.
struct PapercutButtonStyle: ButtonStyle {

    let appearance: PaperButtonAppearance
    var minHeight: CGFloat = Papercut.controlHeightLarge
    var fillsWidth: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        PaperButtonBody(
            label: configuration.label,
            isPressed: configuration.isPressed,
            appearance: appearance,
            minHeight: minHeight,
            fillsWidth: fillsWidth
        )
    }
}

/// ``PapercutButtonStyle``의 몸통. 동작 줄이기·활성 여부를 환경에서 읽으려고 뷰로 뗐다.
private struct PaperButtonBody: View {

    let label: ButtonStyleConfiguration.Label
    let isPressed: Bool
    let appearance: PaperButtonAppearance
    let minHeight: CGFloat
    let fillsWidth: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusMD, style: .continuous)
        // 눌림은 0..1 한 값이다 — 본체가 내려가는 거리를 x·y 따로 애니메이션하면 두 축이
        // 미세하게 어긋나 종이가 비스듬히 미끄러진다. 동작 줄이기면 내려가지 않는다 (KAN-355) — 눌림은 장식이고
        // 누른 결과(다음 화면)가 상태를 말하므로 잃는 정보가 없다.
        let sink: CGFloat = isPressed && isEnabled && !reduceMotion ? 1 : 0

        return label
            .padding(.horizontal, Papercut.space6)
            .frame(maxWidth: fillsWidth ? .infinity : nil)
            // 라벨이 짧아도 손가락이 닿을 만큼은 넓게 잡는다.
            .frame(minWidth: 120, minHeight: minHeight)
            .background(shape.fill(appearance.face))
            .overlay(shape.strokeBorder(appearance.border, lineWidth: appearance.borderWidth))
            .contentShape(shape)
            .offset(x: sink * Papercut.paperShadowX, y: sink * Papercut.paperShadowY)
            .paperShadow(cornerRadius: Papercut.radiusMD, visible: appearance.castsShadow)
            .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.press), value: isPressed)
    }
}

/// 글자 버튼의 눌림 (KAN-355, 시안 `.btn--text:active`): 내려가지 않고 라벨 아래에 밑줄이 선다. 평소에는 밑줄이 없다.
private struct PaperTextButtonStyle: ButtonStyle {

    let underline: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.overlay(alignment: .bottom) {
            if configuration.isPressed {
                // 라벨 상자(48) 아래 끝에서 12 올린 자리 — 한 줄 라벨의 글자 바로 아래다.
                Rectangle()
                    .fill(underline)
                    .frame(height: Papercut.borderHairline)
                    .padding(.horizontal, Papercut.space3)
                    .offset(y: -Papercut.space3)
            }
        }
    }
}
