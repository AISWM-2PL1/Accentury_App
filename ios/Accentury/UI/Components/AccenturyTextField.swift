import SwiftUI

/// 입력 칸 (KAN-224 추가 정보 화면). 안드로이드 `ui/components/AccenturyTextField.kt`의 이식본이다 — 1.5 잉크 테두리,
/// 크림 면, 반경 16, 최소 높이 48. 그림자는 없다: 떠 있는 종이는 주 버튼 하나여야 한다(``AccenturyButton``).
/// 포커스는 테두리가 2로 굵어지는 것으로만 보인다 — 두께가 "지금 이것"을 뜻하는 유일한 자리라는 정본 §8 규칙이다.
///
/// `onTap`을 주면 글자를 치는 칸이 아니라 누르는 칸이 된다(생년월일 — 달력을 연다). 모양은 같고 버튼으로 읽힌다.
struct AccenturyTextField: View {

    /// 칸 위의 이름. 스크린 리더가 칸을 이 이름으로 읽는다
    let label: String
    @Binding var text: String
    /// 비었을 때 칸 안에 흐리게 보이는 안내
    var placeholder: String?
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var onTap: (() -> Void)?

    @FocusState private var focused: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusMD, style: .continuous)
        VStack(alignment: .leading, spacing: Papercut.space2) {
            Text(label)
                .papercutType(.label)
                .foregroundColor(Papercut.ink)
                .accessibilityHidden(true)

            Group {
                if let onTap {
                    Button(action: onTap) {
                        Text(text.isEmpty ? (placeholder ?? "") : text)
                            .papercutType(.body)
                            .foregroundColor(text.isEmpty ? Papercut.muted : Papercut.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label)
                    .accessibilityValue(text)
                } else {
                    TextField("", text: $text, prompt: placeholder.map { Text($0).foregroundColor(Papercut.muted) })
                        .papercutType(.body)
                        .foregroundColor(Papercut.ink)
                        .tint(Papercut.ink)
                        .keyboardType(keyboard)
                        .textContentType(contentType)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focused)
                        .accessibilityLabel(label)
                }
            }
            .padding(.horizontal, Papercut.space4)
            .padding(.vertical, Papercut.space3)
            .frame(minHeight: Papercut.touchTargetMin)
            .background(shape.fill(Papercut.cream))
            .overlay(shape.stroke(Papercut.ink, lineWidth: focused ? Papercut.borderStrong : Papercut.borderRegular))
        }
    }
}
