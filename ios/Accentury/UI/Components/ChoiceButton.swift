import SwiftUI

/// 여럿 중 하나를 고르는 선택지 (KAN-224 — 성별·출신지역). 안드로이드 `ui/components/ChoiceButton.kt`의 이식본이고
/// 웹의 `.choice`와 같은 규칙이다: 1.5 잉크 테두리 + 크림 면 + 반경 16, **고른 것만 테두리 2와 오프셋 그림자**.
/// 색으로 고른 것을 가르지 않는다 (정본 §7).
///
/// 그림자 자리는 고르지 않은 칸도 비워 둔다(``View/paperShadow(cornerRadius:visible:)``의 visible=false) — 고를 때마다
/// 칸 크기가 바뀌면 격자가 들썩인다. 라벨은 웹 2열 선택지와 같은 Jua `title`이다. 스크린 리더에는 선택 상태가 붙은
/// 버튼으로 읽힌다(SwiftUI에는 라디오 역할이 없어 `.isSelected` 특성이 그 자리다).
struct ChoiceButton: View {

    let label: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusMD, style: .continuous)
        Button(action: action) {
            Text(label)
                .papercutType(.title)
                .foregroundColor(Papercut.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, minHeight: Papercut.controlHeightLarge)
                .padding(.horizontal, Papercut.space3)
                .background(shape.fill(Papercut.cream))
                .overlay(shape.stroke(Papercut.ink, lineWidth: selected ? Papercut.borderStrong : Papercut.borderRegular))
                .contentShape(shape)
                .paperShadow(cornerRadius: Papercut.radiusMD, visible: selected)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
