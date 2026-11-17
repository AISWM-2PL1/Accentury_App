import SwiftUI

/// 여럿 중 하나를 고르는 선택지 (KAN-224, 모양은 KAN-355 시안 s-02-profile `.p4-gender-row .choice`). 지금 사용처는 프로필 화면의
/// 성별 셋이다 — 출신 지역은 KAN-355부터 지도 화면 칩(``RegionSelectScreen``)이 고른다. 종이 면·잉크 1 테두리·반경 6·높이 48·
/// 종이 그림자, **고른 것만 테두리 2**. 색으로 고른 것을 가르지 않는다 (정본 §7). 라벨은 Jua 16이다.
///
/// 스크린 리더에는 선택 상태가 붙은 버튼으로 읽힌다(SwiftUI에는 라디오 역할이 없어 `.isSelected` 특성이 그 자리다).
struct ChoiceButton: View {

    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusMD, style: .continuous)
        Button {
            // 고를 때 가벼운 탭 (KAN-258) — 웹 객관식 선택과 같은 규칙이다
            HapticPlayer.play(.tap)
            action()
        } label: {
            Text(label)
                .papercutType(.textButton)
                .foregroundColor(Papercut.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: Papercut.touchTargetMin)
                .padding(.horizontal, Papercut.space2)
                .background(shape.fill(Papercut.paper))
                .overlay(shape.strokeBorder(Papercut.ink, lineWidth: selected ? Papercut.borderStrong : Papercut.borderHairline))
                .contentShape(shape)
                .paperShadow(cornerRadius: Papercut.radiusMD)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
